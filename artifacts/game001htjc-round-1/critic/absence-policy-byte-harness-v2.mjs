import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const [candidateRoot, baselineRoot, compatibilityRoot, baselineCommit] = process.argv.slice(2);
assert.ok(candidateRoot && baselineRoot && compatibilityRoot && baselineCommit,
  "candidate, pinned baseline, compatibility control, and pin are required");

const importAt = (root, path) => import(pathToFileURL(`${root}/${path}`).href);
const [candidateBattle, baselineBattle, compatibilityBattle,
  candidateTroops, baselineTroops, candidatePlayable, baselinePlayable,
  candidateProjectileProfiles, compatibilityProjectileProfiles] = await Promise.all([
  importAt(candidateRoot, "src/sim/live-battle.js"),
  importAt(baselineRoot, "src/sim/live-battle.js"),
  importAt(compatibilityRoot, "src/sim/live-battle.js"),
  importAt(candidateRoot, "src/content/session-troop-roster.js"),
  importAt(baselineRoot, "src/content/session-troop-roster.js"),
  importAt(candidateRoot, "src/content/playable-roster.js"),
  importAt(baselineRoot, "src/content/playable-roster.js"),
  importAt(candidateRoot, "src/content/session-troop-projectile-profiles.js"),
  importAt(compatibilityRoot, "src/content/session-troop-projectile-profiles.js"),
]);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function questionInventory(playableModule, roster, supplemental = []) {
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
  const available = new Map([
    ...playableModule.createPlayableRosterQuestionRecords(),
    ...supplemental,
  ].map((record) => [record.key, record]));
  return [...referenced].sort().map((key) => {
    const record = available.get(key);
    assert.ok(record, `question receipt exists for ${key}`);
    return record;
  });
}

function hostSetup(troopModule, playableModule) {
  const witness = troopModule.createSessionTroopWitness("stormkite");
  const roster = clone(witness.roster);
  return canonical({
    initialWindupTicks: { central: 10_000, lane: 10_000 },
    questions: questionInventory(playableModule, roster, [...witness.questions]),
    roster,
  });
}

const candidateSetup = hostSetup(candidateTroops, candidatePlayable);
const baselineSetup = hostSetup(baselineTroops, baselinePlayable);
assert.equal(candidateSetup, baselineSetup, "the all-unit Stormkite host setup matches pinned bytes");
assert.equal(canonical(candidateBattle.parseLiveBattleSetup(candidateSetup)),
  canonical(baselineBattle.parseLiveBattleSetup(candidateSetup)),
  "the raw pinned parser and candidate admit the same source fixture");

const snapshots = [];
function observePair(label, candidate, baseline, { noProjectileRuntime = false } = {}) {
  const candidateBytes = candidate.serialize();
  const baselineBytes = baseline.serialize();
  assert.equal(Buffer.compare(Buffer.from(candidateBytes, "utf8"), Buffer.from(baselineBytes, "utf8")), 0,
    `${label}: candidate bytes and comparison-control bytes match exactly`);
  for (const [name, battle, bytes] of [
    ["candidate", candidate, candidateBytes],
    ["comparison", baseline, baselineBytes],
  ]) {
    const snapshot = JSON.parse(bytes);
    assert.equal(Object.hasOwn(snapshot, "chainRuntime"), false, `${label}: ${name} has no chain policy key`);
    assert.equal(snapshot.version, 2, `${label}: ${name} retains outer version 2`);
    assert.equal(Object.hasOwn(snapshot, "projectileRuntime"), !noProjectileRuntime,
      `${label}: ${name} uses the expected projectile receipt path`);
    const Battle = name === "candidate" ? candidateBattle :
      noProjectileRuntime ? baselineBattle : compatibilityBattle;
    assert.equal(Battle.LiveBattle.restore(bytes).serialize(), bytes,
      `${label}: ${name} restores exact snapshot bytes`);
  }
  snapshots.push({
    label,
    bytes: Buffer.byteLength(candidateBytes, "utf8"),
    sha256: createHash("sha256").update(candidateBytes, "utf8").digest("hex"),
    exactUtf8BytesEqual: true,
  });
}

function pairStep(candidate, baseline, label) {
  const candidateEvents = candidate.step();
  const baselineEvents = baseline.step();
  assert.equal(canonical(candidateEvents), canonical(baselineEvents),
    `${label}: all host events match at the shared tick`);
  return candidateEvents;
}

function scheduleDuel(candidate, baseline) {
  const deployments = [
    { cardId: "stormkite", point: { x: 3_500, y: 17_500 }, sequence: 0, side: "north", tick: 0 },
    { cardId: "mossguard", point: { x: 3_500, y: 14_000 }, sequence: 1, side: "south", tick: 0 },
  ];
  for (const battle of [candidate, baseline]) {
    for (const deployment of deployments) battle.scheduleDeploy(canonical(deployment));
  }
}

function unitId(battle, cardId) {
  return battle.state.units.find(({ cardId: id }) => id === cardId)?.id;
}

const CandidateBattle = candidateBattle.LiveBattle;
const BaselineBattle = baselineBattle.LiveBattle;

// Raw pinned e35 path: the legacy constructor has no optional projectile receipt.
const legacyCandidate = new CandidateBattle(candidateSetup);
const legacyBaseline = new BaselineBattle(baselineSetup);
observePair("raw-e35-default8-constructed-no-optional-projectile-receipt",
  legacyCandidate, legacyBaseline, { noProjectileRuntime: true });
scheduleDuel(legacyCandidate, legacyBaseline);
observePair("raw-e35-default8-deployments-scheduled",
  legacyCandidate, legacyBaseline, { noProjectileRuntime: true });
pairStep(legacyCandidate, legacyBaseline, "raw-e35 default8 deployment");
observePair("raw-e35-default8-units-deployed",
  legacyCandidate, legacyBaseline, { noProjectileRuntime: true });

const legacyTargetId = unitId(legacyCandidate, "mossguard");
const legacySourceId = unitId(legacyCandidate, "stormkite");
assert.ok(legacyTargetId !== undefined && legacySourceId !== undefined,
  "the raw-e35 duel deploys both witnessed unit owners");
let ordinaryCombat = null;
for (let tick = 0; tick < 2_400 && ordinaryCombat === null; tick += 1) {
  const candidateBefore = legacyCandidate.state.units.find(({ id }) => id === legacyTargetId)?.hitpoints;
  const baselineBefore = legacyBaseline.state.units.find(({ id }) => id === legacyTargetId)?.hitpoints;
  const events = pairStep(legacyCandidate, legacyBaseline, `raw-e35 default8 ordinary combat tick ${tick}`);
  const damage = events.find(({ type, targetId }) => type === "damage" && targetId === legacyTargetId);
  if (damage === undefined) continue;
  const candidateAfter = legacyCandidate.state.units.find(({ id }) => id === legacyTargetId)?.hitpoints;
  const baselineAfter = legacyBaseline.state.units.find(({ id }) => id === legacyTargetId)?.hitpoints;
  if (!(candidateBefore > candidateAfter && baselineBefore > baselineAfter)) continue;
  assert.ok(damage.amount > 0, "ordinary combat reports positive damage for the target");
  assert.equal(candidateBefore - candidateAfter, baselineBefore - baselineAfter,
    "raw-e35 and candidate ordinary combat change the unit HP owner by the same amount");
  assert.equal(candidateAfter, baselineAfter, "raw-e35 and candidate unit HP owners match");
  observePair("raw-e35-default8-ordinary-combat-unit-hp-loss",
    legacyCandidate, legacyBaseline, { noProjectileRuntime: true });
  ordinaryCombat = {
    tick: damage.tick,
    sourceId: damage.sourceId,
    targetId: legacyTargetId,
    sourceUnitId: legacySourceId,
    damageEventAmount: damage.amount,
    unitHitpointsBefore: candidateBefore,
    unitHitpointsAfter: candidateAfter,
    actualHpDelta: candidateBefore - candidateAfter,
  };
}
assert.ok(ordinaryCombat, "raw-e35 default8 ordinary combat reaches real unit HP loss");

// Supplemental compatibility control: the optional projectile receipt in raw e35
// requires only the isolated frozen-array sort repair captured by the launcher.
const candidateReceipt = candidateProjectileProfiles.serializeSessionTroopProjectileProfileManifest();
const compatibilityReceipt = compatibilityProjectileProfiles
  .serializeSessionTroopProjectileProfileManifest();
assert.equal(candidateReceipt, compatibilityReceipt, "the optional projectile receipts match the pinned source");
const ProjectileCandidate = new CandidateBattle(candidateSetup, undefined, undefined, candidateReceipt);
const ProjectileCompatibility = new compatibilityBattle.LiveBattle(
  candidateSetup, undefined, undefined, compatibilityReceipt);
observePair("compatibility-control-constructed-no-chain-policy",
  ProjectileCandidate, ProjectileCompatibility);
scheduleDuel(ProjectileCandidate, ProjectileCompatibility);
observePair("compatibility-control-deployments-scheduled",
  ProjectileCandidate, ProjectileCompatibility);
pairStep(ProjectileCandidate, ProjectileCompatibility, "compatibility-control deployment");
observePair("compatibility-control-units-deployed", ProjectileCandidate, ProjectileCompatibility);

const sourceId = unitId(ProjectileCandidate, "stormkite");
const targetId = unitId(ProjectileCandidate, "mossguard");
assert.ok(sourceId !== undefined && targetId !== undefined,
  "the compatibility control deploys its authenticated source and target");
let launch = null;
for (let tick = 0; tick < 1_200 && launch === null; tick += 1) {
  const events = pairStep(ProjectileCandidate, ProjectileCompatibility,
    `compatibility-control launch tick ${tick}`);
  launch = events.find((event) => event.type === "projectile-launch" &&
    (event.projectileIdentity ?? event.projectile?.projectileIdentity)?.sourceId === sourceId) ?? null;
}
assert.ok(launch, "the compatibility control observes a real ordinary projectile launch");
const identity = launch.projectileIdentity ?? launch.projectile?.projectileIdentity;
const projectile = ProjectileCandidate.state.projectiles.find(({ projectileIdentity }) =>
  canonical(projectileIdentity) === canonical(identity));
assert.ok(projectile, "the ordinary launched root remains pending in the shared projectile owner");
assert.ok(projectile.impactTick > projectile.launchTick, "the launch checkpoint is in flight");
observePair("compatibility-control-ordinary-projectile-in-flight",
  ProjectileCandidate, ProjectileCompatibility);

let contact = null;
for (let tick = 0; tick < 1_200 && contact === null; tick += 1) {
  const beforeCandidate = ProjectileCandidate.state.units.find(({ id }) => id === targetId)?.hitpoints;
  const beforeCompatibility = ProjectileCompatibility.state.units.find(({ id }) => id === targetId)?.hitpoints;
  const events = pairStep(ProjectileCandidate, ProjectileCompatibility,
    `compatibility-control contact tick ${tick}`);
  const impact = events.find((event) => event.type === "projectile-impact" &&
    event.status === "contact" &&
    canonical(event.projectileIdentity ?? event.projectile?.projectileIdentity) === canonical(identity));
  if (impact === undefined) continue;
  const afterCandidate = ProjectileCandidate.state.units.find(({ id }) => id === targetId)?.hitpoints;
  const afterCompatibility = ProjectileCompatibility.state.units.find(({ id }) => id === targetId)?.hitpoints;
  const damage = events.find(({ type, projectileId, targetId: damagedId }) =>
    type === "damage" && projectileId === impact.projectileId && damagedId === targetId);
  assert.ok(damage && damage.amount > 0, "the ordinary primary has positive host damage");
  assert.ok(Number.isFinite(beforeCandidate) && beforeCandidate > afterCandidate,
    "ordinary primary contact reduces the unit HP owner");
  assert.equal(beforeCandidate - afterCandidate, beforeCompatibility - afterCompatibility,
    "candidate and compatibility control have the same actual HP delta");
  assert.equal(afterCandidate, afterCompatibility, "candidate and compatibility HP owners match");
  assert.equal(damage.targetId, targetId, "the real primary damages the witnessed target");
  observePair("compatibility-control-ordinary-projectile-contact-and-unit-hp-loss",
    ProjectileCandidate, ProjectileCompatibility);
  contact = {
    tick: impact.tick,
    projectileId: damage.projectileId,
    sourceId,
    targetId,
    status: "contact",
    damageEventAmount: damage.amount,
    unitHitpointsBefore: beforeCandidate,
    unitHitpointsAfter: afterCandidate,
    actualHpDelta: beforeCandidate - afterCandidate,
  };
}
assert.ok(contact, "the compatibility control observes real projectile contact and unit HP loss");

process.stdout.write(`${JSON.stringify({
  result: "PASS",
  baselineCommit,
  rawPinnedDefault8: {
    optionalProjectileReceipt: false,
    policyAbsent: true,
    ordinaryCombat,
  },
  compatibilityControl: {
    baselineChange: "one frozen-array local-copy sort repair in the isolated e35 copy",
    optionalProjectileReceipt: true,
    policyAbsent: true,
    ordinaryProjectile: { launchTick: launch.tick, identity, contact },
  },
  checkpoints: snapshots,
})}\n`);
