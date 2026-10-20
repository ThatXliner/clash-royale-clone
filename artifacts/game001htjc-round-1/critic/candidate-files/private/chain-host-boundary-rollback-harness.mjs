// Private qualification harness. This creates bounded, temporary source copies
// and injects one deterministic throw at LiveBattle.step's clone/adopt seam. It
// is not imported by the product, package scripts, or shipping test suite.

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, lstat, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const CANDIDATE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOT = join(CANDIDATE_ROOT, "src");
const PRIVATE_COPIES_ROOT = join(CANDIDATE_ROOT, "private-boundary-rollback-copies");
const MAX_SOURCE_FILES = 200;
const MAX_SOURCE_BYTES = 4 * 1024 * 1024;
const MAX_CHAIN_TICKS = 1_200;
const FORCED_FAILURE = "private qualification throw after candidate advance";

const STEP_CLONE_ADOPT_ANCHOR = [
  "    this.#preflightBoundary();",
  "    const candidate = this.#runtimeClone();",
  "    const events = candidate.#advance();",
  "    this.#adopt(candidate);",
  "    return freeze(clone(events));",
  "  }",
  "",
  "  stepMany(ticks) {",
].join("\n");

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function replaceExactlyOnce(source, anchor, replacement, label) {
  const count = source.split(anchor).length - 1;
  assert.equal(count, 1, `${label}: expected one stable clone/adopt anchor, found ${count}`);
  return source.replace(anchor, replacement);
}

function injectedKernel(source, inPlace) {
  const candidateLine = inPlace
    ? "    const candidate = this;"
    : "    const candidate = this.#runtimeClone();";
  const replacement = [
    "    this.#preflightBoundary();",
    candidateLine,
    "    const events = candidate.#advance();",
    `    throw new Error(${JSON.stringify(FORCED_FAILURE)});`,
    "    this.#adopt(candidate);",
    "    return freeze(clone(events));",
    "  }",
    "",
    "  stepMany(ticks) {",
  ].join("\n");
  return replaceExactlyOnce(source, STEP_CLONE_ADOPT_ANCHOR, replacement,
    inPlace ? "in-place negative control" : "clone fault copy");
}

async function walkSource(directory, relative = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const found = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = join(directory, entry.name);
    const rel = relative === "" ? entry.name : join(relative, entry.name);
    const info = await lstat(absolutePath);
    assert.equal(info.isSymbolicLink(), false, `source copy excludes symlinks: ${rel}`);
    if (entry.isDirectory()) found.push(...await walkSource(absolutePath, rel));
    else {
      assert.equal(entry.isFile(), true, `source copy accepts regular files only: ${rel}`);
      found.push({ absolutePath, bytes: info.size, relativePath: rel });
    }
  }
  return found;
}

async function boundedSourceInventory(directory) {
  const files = await walkSource(directory);
  const bytes = files.reduce((sum, file) => sum + file.bytes, 0);
  assert.ok(files.length <= MAX_SOURCE_FILES,
    `private source copy file count ${files.length} exceeds ${MAX_SOURCE_FILES}`);
  assert.ok(bytes <= MAX_SOURCE_BYTES,
    `private source copy byte count ${bytes} exceeds ${MAX_SOURCE_BYTES}`);
  return { bytes, files };
}

async function sourceChecksums(directory) {
  const { files } = await boundedSourceInventory(directory);
  const manifest = {};
  for (const file of files) {
    const data = await readFile(file.absolutePath);
    manifest[file.relativePath.split("\\").join("/")] = {
      bytes: data.byteLength,
      sha256: createHash("sha256").update(data).digest("hex"),
    };
  }
  return manifest;
}

async function makeSourceCopy(runRoot, name, variant) {
  const copyRoot = join(runRoot, name);
  const copySource = join(copyRoot, "src");
  await mkdir(copyRoot, { recursive: false });
  const sourceInventory = await boundedSourceInventory(SOURCE_ROOT);
  await cp(SOURCE_ROOT, copySource, { recursive: true, dereference: false, errorOnExist: true });
  const copiedInventory = await boundedSourceInventory(copySource);
  assert.equal(copiedInventory.files.length, sourceInventory.files.length,
    `${name}: bounded copy preserves the source file count`);
  assert.equal(copiedInventory.bytes, sourceInventory.bytes,
    `${name}: bounded copy preserves source bytes before injection`);
  await writeFile(join(copyRoot, "package.json"), '{"type":"module"}\n');

  if (variant !== "clean") {
    const kernelPath = join(copySource, "sim", "battle-continuation-kernel.js");
    const original = await readFile(kernelPath, "utf8");
    await writeFile(kernelPath, injectedKernel(original, variant === "in-place"));
  }

  await boundedSourceInventory(copySource);
  return { copyRoot, copySource, name, variant };
}

async function verifyVariantIsolation(variants) {
  const manifests = new Map();
  for (const variant of variants) {
    manifests.set(variant.name, await sourceChecksums(variant.copySource));
  }
  const clean = manifests.get("clean-control");
  for (const variant of variants.filter(({ name }) => name !== "clean-control")) {
    const changed = Object.keys(clean).filter((path) =>
      canonical(clean[path]) !== canonical(manifests.get(variant.name)[path]));
    assert.deepEqual(changed, ["sim/battle-continuation-kernel.js"],
      `${variant.name}: only the single private injection file differs from clean source`);
  }
  assert.deepEqual(Object.keys(clean).sort(),
    Object.keys(manifests.get("forced-throw-after-clone-advance")).sort(),
    "fault copy has the same bounded source file set as clean control");
  assert.deepEqual(Object.keys(clean).sort(),
    Object.keys(manifests.get("forced-throw-after-in-place-advance")).sort(),
    "in-place negative control has the same bounded source file set as clean control");
  return Object.fromEntries(manifests);
}

async function importFrom(copyRoot, relativePath) {
  return import(pathToFileURL(join(copyRoot, relativePath)).href);
}

function questionInventory(roster, supplemental = [], questionRecords) {
  const referenced = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (key === "questionKey" && typeof child === "string") referenced.add(child);
        else visit(child);
      }
    }
  };
  roster.filter(({ kind }) => kind === "unit").forEach(({ entities }) => visit(entities));
  const available = new Map([...questionRecords, ...supplemental].map((record) => [record.key, record]));
  return [...referenced].sort().map((key) => {
    const record = available.get(key);
    assert.ok(record, `question receipt exists for ${key}`);
    return record;
  });
}

function makeSetup(modules) {
  const witness = modules.createSessionTroopWitness("stormkite");
  const roster = structuredClone(witness.roster);
  roster[1] = structuredClone(modules.projectSessionNonUnitBattleCard("bulwark-needle"));
  roster[7] = structuredClone(modules.projectSessionNonUnitBattleCard("squall-orb"));
  return {
    initialWindupTicks: { central: 10_000, lane: 10_000 },
    questions: questionInventory(roster, witness.questions,
      modules.createPlayableRosterQuestionRecords()),
    roster,
    spellProfileReceipts: modules.createSessionSpellProfileReceipts(),
  };
}

function makeBattle(modules) {
  const setup = makeSetup(modules);
  return new modules.LiveBattle(canonical(setup), undefined, undefined,
    modules.serializeSessionTroopProjectileProfileManifest(),
    modules.createStormkiteChainQuestionHostPolicy());
}

function stageBattle(battle) {
  battle.scheduleDeploy(canonical({ cardId: "stormkite", point: { x: 3_500, y: 17_500 },
    sequence: 0, side: "north", tick: 0 }));
  battle.scheduleDeploy(canonical({ cardId: "mossguard", point: { x: 3_500, y: 14_000 },
    sequence: 1, side: "south", tick: 0 }));
  battle.scheduleStructure({ cardId: "bulwark-needle", destination: null,
    point: { x: 3_500, y: 12_500 }, sequence: 2, side: "south", tick: 0 });
  battle.step();
}

function primaryBeforeContactSnapshot(battle) {
  for (let elapsed = 0; elapsed < MAX_CHAIN_TICKS; elapsed += 1) {
    const before = battle.serialize();
    const events = battle.step();
    if (events.some(({ type }) => type === "chain-primary-contact")) return before;
  }
  throw new Error(`Stormkite primary was not observed within ${MAX_CHAIN_TICKS} ticks`);
}

function advanceThroughPrimary(battle) {
  for (let elapsed = 0; elapsed < MAX_CHAIN_TICKS; elapsed += 1) {
    const events = battle.step();
    const primary = events.find(({ type }) => type === "chain-primary-contact");
    if (primary !== undefined) return primary;
  }
  throw new Error(`Stormkite primary was not observed within ${MAX_CHAIN_TICKS} ticks`);
}

function scheduleKillSpells(battle, sourceId) {
  const source = battle.state.units.find(({ id }) => id === sourceId);
  assert.ok(source?.alive, "Stormkite is alive when the fixture's explicit spell commands are queued");
  for (const sequence of [0, 1]) {
    battle.scheduleSpell({ cardId: "squall-orb", point: structuredClone(source.position), sequence,
      side: "south", target: { id: sourceId, kind: "unit" }, tick: battle.state.tick });
  }
}

function fixtureSnapshot(modules, witness) {
  const battle = makeBattle(modules);
  stageBattle(battle);
  if (witness === "unit") return primaryBeforeContactSnapshot(battle);

  const primary = advanceThroughPrimary(battle);
  scheduleKillSpells(battle, primary.identity.sourceId);
  if (witness === "building") return battle.serialize();

  const buildingEvents = battle.step();
  assert.ok(buildingEvents.some(({ hop, outcome, target, type }) =>
    type === "chain-hop-contact" && hop === 2 && outcome === "contact" && target.type === "building"),
  "crown fixture reaches a real building hit before its chosen crown-tower boundary");
  return battle.serialize();
}

function allHealthOwners(state) {
  const owner = ({ alive, hitpoints, id }) => ({ alive, hitpoints, id });
  return {
    structures: state.structures.map(owner),
    towers: state.towers.map(owner),
    units: state.units.map(owner),
  };
}

function boundaryBytes(battle) {
  const state = battle.state;
  return {
    allOwnerHP: canonical(allHealthOwners(state)),
    serialize: battle.serialize(),
    state: canonical(state),
  };
}

function ownerHitpoints(battle, witness, id) {
  const state = battle.state;
  const ownerArray = witness === "unit" ? state.units
    : witness === "building" ? state.structures : state.towers;
  const owner = ownerArray.find((entry) => entry.id === id);
  assert.ok(owner, `${witness} health owner ${id} exists`);
  return owner.hitpoints;
}

function findWitness(events, witness) {
  if (witness === "unit") {
    const event = events.find(({ type }) => type === "chain-primary-contact");
    assert.ok(event, "chosen boundary contains the real Stormkite primary contact");
    assert.equal(event.target.type, "unit");
    return { event, id: event.target.id };
  }
  const hop = witness === "building" ? 2 : 3;
  const targetType = witness === "building" ? "building" : "crown-tower";
  const event = events.find(({ hop: eventHop, outcome, target, type }) =>
    type === "chain-hop-contact" && eventHop === hop && outcome === "contact" &&
    target.type === targetType);
  assert.ok(event, `chosen boundary contains a real chain hop ${hop} ${targetType} contact`);
  return { event, id: event.target.id };
}

function forcedThrow(battle) {
  assert.throws(() => battle.step(), (error) => error?.message === FORCED_FAILURE,
    "the instrumented public LiveBattle.step throws at the chosen pre-adopt seam");
}

async function verifyWitness(modules, snapshots, witness) {
  const snapshot = snapshots[witness];
  const clean = modules.clean.LiveBattle.restore(snapshot);
  assert.equal(clean.serialize(), snapshot, `${witness}: clean control restores the exact fixture snapshot`);
  const beforeClean = boundaryBytes(clean);
  const cleanEvents = clean.step();
  const { event, id } = findWitness(cleanEvents, witness);
  const cleanBeforeHP = ownerHitpointsFromBytes(beforeClean, witness, id);
  const cleanAfterHP = ownerHitpoints(clean, witness, id);
  assert.ok(cleanAfterHP < cleanBeforeHP,
    `${witness}: clean public step changes the real target HP owner`);
  if (witness === "unit") {
    assert.equal(cleanBeforeHP - cleanAfterHP, 192,
      "unit clean control witnesses Stormkite's actual 192 HP primary contact");
  }
  const afterClean = boundaryBytes(clean);
  assert.notEqual(afterClean.serialize, beforeClean.serialize,
    `${witness}: clean step commits a serialized LiveBattle change`);

  const fault = modules.fault.LiveBattle.restore(snapshot);
  assert.equal(fault.serialize(), snapshot, `${witness}: fault copy starts from the same snapshot bytes`);
  const beforeFault = boundaryBytes(fault);
  assert.deepEqual(beforeFault, beforeClean,
    `${witness}: clean and fault copies start from byte-identical live states`);
  forcedThrow(fault);
  assert.deepEqual(boundaryBytes(fault), beforeFault,
    `${witness}: clone fault leaves full serialization, state, and all owner HP bytes unchanged`);

  const inPlace = modules.inPlace.LiveBattle.restore(snapshot);
  assert.equal(inPlace.serialize(), snapshot,
    `${witness}: in-place negative control starts from the same snapshot bytes`);
  const beforeInPlace = boundaryBytes(inPlace);
  forcedThrow(inPlace);
  const afterInPlace = boundaryBytes(inPlace);
  let rollbackAssertionFailed = false;
  try {
    assert.deepEqual(afterInPlace, beforeInPlace,
      `${witness}: the normal rollback assertion must reject in-place advance`);
  } catch (error) {
    if (error?.code !== "ERR_ASSERTION") throw error;
    rollbackAssertionFailed = true;
  }
  assert.equal(rollbackAssertionFailed, true,
    `${witness}: the same rollback assertion fails for the in-place negative control`);
  assert.notEqual(ownerHitpoints(inPlace, witness, id), cleanBeforeHP,
    `${witness}: in-place negative control exposes the real HP mutation before throwing`);
  assert.notEqual(afterInPlace.serialize, beforeInPlace.serialize,
    `${witness}: in-place negative control leaves the whole battle changed`);

  return {
    chosenCall: "LiveBattle.step()",
    cleanHPBefore: cleanBeforeHP,
    cleanHPAfter: cleanAfterHP,
    forcedFaultSite: "candidate.#advance() returned; throw inserted before this.#adopt(candidate)",
    hpOwnerId: id,
    witness,
    witnessEventType: event.type,
    rollbackExactBytes: true,
    negativeControlMutationVisible: true,
  };
}

function ownerHitpointsFromBytes(bytes, witness, id) {
  const state = JSON.parse(bytes.state);
  const owners = witness === "unit" ? state.units
    : witness === "building" ? state.structures : state.towers;
  const owner = owners.find((entry) => entry.id === id);
  assert.ok(owner, `${witness} baseline owner ${id} exists`);
  return owner.hitpoints;
}

async function main() {
  const sourceInventory = await boundedSourceInventory(SOURCE_ROOT);
  const runId = `run-${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${process.pid}`;
  const runRoot = join(PRIVATE_COPIES_ROOT, runId);
  await mkdir(PRIVATE_COPIES_ROOT, { recursive: true });
  await mkdir(runRoot, { recursive: false });

  const variants = [
    await makeSourceCopy(runRoot, "clean-control", "clean"),
    await makeSourceCopy(runRoot, "forced-throw-after-clone-advance", "clone-fault"),
    await makeSourceCopy(runRoot, "forced-throw-after-in-place-advance", "in-place"),
  ];
  const checksums = await verifyVariantIsolation(variants);
  const modules = {};
  for (const variant of variants) {
    const [battle, troopRoster, cardCatalog, playableRoster, spellReceipts, projectileProfiles] =
      await Promise.all([
        importFrom(variant.copyRoot, "src/sim/live-battle.js"),
        importFrom(variant.copyRoot, "src/content/session-troop-roster.js"),
        importFrom(variant.copyRoot, "src/content/session-card-catalog.js"),
        importFrom(variant.copyRoot, "src/content/playable-roster.js"),
        importFrom(variant.copyRoot, "src/content/session-spell-profile-receipts.js"),
        importFrom(variant.copyRoot, "src/content/session-troop-projectile-profiles.js"),
      ]);
    modules[variant.variant === "clean" ? "clean"
      : variant.variant === "clone-fault" ? "fault" : "inPlace"] = {
        createPlayableRosterQuestionRecords: playableRoster.createPlayableRosterQuestionRecords,
        createSessionSpellProfileReceipts: spellReceipts.createSessionSpellProfileReceipts,
        createSessionTroopWitness: troopRoster.createSessionTroopWitness,
        createStormkiteChainQuestionHostPolicy: battle.createStormkiteChainQuestionHostPolicy,
        LiveBattle: battle.LiveBattle,
        projectSessionNonUnitBattleCard: cardCatalog.projectSessionNonUnitBattleCard,
        serializeSessionTroopProjectileProfileManifest:
          projectileProfiles.serializeSessionTroopProjectileProfileManifest,
      };
  }

  const fixtures = {};
  for (const witness of ["unit", "building", "crown"]) {
    fixtures[witness] = fixtureSnapshot(modules.clean, witness);
    assert.ok(fixtures[witness].length <= 8_388_608,
      `${witness}: fixture snapshot stays under the existing LiveBattle byte bound`);
  }
  const results = [];
  for (const witness of ["unit", "building", "crown"]) {
    results.push(await verifyWitness(modules, fixtures, witness));
  }

  const report = {
    candidateRoot: CANDIDATE_ROOT,
    copyRoots: Object.fromEntries(variants.map(({ copyRoot, name, variant }) =>
      [name, { copyRoot, variant }])),
    faultInjection: {
      changedFiles: ["src/sim/battle-continuation-kernel.js"],
      exactAnchorReplacementCount: 1,
      forcedThrow: FORCED_FAILURE,
      inPlaceNegativeControlIsNotProductCode: true,
      placement: "LiveBattle.step(): immediately after candidate.#advance() and before this.#adopt(candidate)",
    },
    runtimeLabel: "private nonmechanics fault-injection harness; not a natural cap/history failure",
    sourceCopyBound: { files: sourceInventory.files.length, maxBytes: MAX_SOURCE_BYTES,
      maxFiles: MAX_SOURCE_FILES, bytes: sourceInventory.bytes },
    sourceChecksums: checksums,
    witnesses: results,
  };
  const reportPath = join(runRoot, "report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ reportPath, runRoot, witnesses: results }, null, 2)}\n`);
}

await main();
