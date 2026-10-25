import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  createSessionTroopProjectileProfileManifest,
  serializeSessionTroopProjectileProfileManifest,
} from "../src/content/session-troop-projectile-profiles.js";
import { createSessionTroopWitness } from "../src/content/session-troop-roster.js";
import { DeckCycle } from "../src/sim/deck.js";
import { BattleCombat as ExtractedBattleCombat } from "../src/sim/battle-combat.js";
import {
  defineBattleCombat as extractedDefineBattleCombat,
} from "../src/sim/battle-combat-runtime.js";
import { GameSession as ExtractedGameSession } from "../src/sim/game-session.js";
import { LiveBattle as ExtractedLiveBattle } from "../src/sim/live-battle.js";

const BASELINE_ROOT_ENV = "SHARED_COMBAT_BASELINE_ROOT";
const ACCEPTED_SOURCE_HASHES = Object.freeze({
  "src/sim/battle-continuation-kernel.js": "2451dd8f5548c660d5802dd901183f2088124da60d36005f47aac79830a10c03",
  "src/sim/battle-combat.js": "a9adf0d16359077bd0453cf2b8716e817d0a47c78073cde25a8b44a0c4ce3922",
  "src/sim/game-session.js": "a11f43213632bcd7be3d4945846cf5dcbfaeaf4b961a32c420c590f67519daa1",
  "src/sim/live-battle.js": "208186e8d90ba1501f563f55d42f2bb5ec5da1daaea46b96ef41c74b1a48da2a",
});
const CANDIDATE_SOURCE_HASHES = Object.freeze({
  "src/sim/battle-combat-runtime.js": "cdb0e1405ddd0a768e1f79de9266dcf4da764f7c063f61d8bc05e8935b84e1f8",
  "src/sim/opaque-continuation.js": "c1ea311230dc4f65bceccd46eff60b8be68d2c559fe60d9f9a9b9c3a2dfce84e",
});
const MANIFEST = createSessionTroopProjectileProfileManifest();
const PROJECTILE_RECEIPT = serializeSessionTroopProjectileProfileManifest();
const SOUTH = Object.freeze({ x: 3_500, y: 14_500 });

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(source) {
  return createHash("sha256").update(source).digest("hex");
}

function acceptedBaselinePath(context) {
  const configuredRoot = process.env[BASELINE_ROOT_ENV];
  if (!configuredRoot) {
    context.skip(`set ${BASELINE_ROOT_ENV} to an immutable accepted e476 source snapshot (product sources match ea7a9755)`);
    return null;
  }
  return resolve(configuredRoot);
}

function readAcceptedBaselineSource(baselineRoot, relativePath) {
  const source = readFileSync(join(baselineRoot, relativePath));
  assert.equal(sha256(source), ACCEPTED_SOURCE_HASHES[relativePath],
    `${relativePath} e476 source snapshot hash`);
  return source;
}

function combatUnit(id, side, overrides = {}) {
  return {
    cadenceTicks: 60,
    damage: 10,
    delivery: "melee",
    deployTicks: 0,
    firstHitTicks: 0,
    id,
    layer: "ground",
    maxHealth: 100,
    position: { x: side === "north" ? 0 : 1_000, y: 0 },
    projectileSpeed: null,
    radius: 100,
    reach: 800,
    side,
    sightRange: 5_000,
    targetMode: "ground",
    ...overrides,
  };
}

function observeCombat(combat) {
  return {
    effectFeedBytes: combat.combatEffectFeedBytes(),
    replay: combat.replay,
    serialized: combat.serialize(),
    state: combat.state,
  };
}

function runCombatProjectileFixture(BattleCombat) {
  const combat = new BattleCombat();
  combat.spawn({ ...combatUnit(1, "north", {
    cadenceTicks: 100,
    damage: 40,
    delivery: "projectile",
    position: { x: 0, y: 0 },
    projectileSpeed: 300,
  }), tick: 0 });
  combat.spawn({ ...combatUnit(2, "south", {
    damage: 0,
    firstHitTicks: 100,
    position: { x: 1_000, y: 0 },
  }), tick: 0 });

  const checkpoints = [];
  const tickZero = combat.step(0);
  checkpoints.push({ events: tickZero, tick: 0, ...observeCombat(combat) });
  const pendingBytes = combat.serialize();
  assert.equal(combat.state.projectiles.length, 1);
  assert.equal(combat.state.projectiles[0].impactTick, 3);

  const branches = [
    { name: "live", combat },
    { name: "fork", combat: combat.fork() },
    { name: "restore", combat: BattleCombat.restore(pendingBytes) },
  ];
  const lethal = {
    ...combatUnit(3, "north", {
      damage: 100,
      position: { x: 1_000, y: 0 },
      reach: 0,
    }),
    tick: 1,
  };
  for (const branch of branches) branch.combat.scheduleSpawn(lethal);

  const branchOutputs = [];
  for (const branch of branches) {
    const ticks = [];
    for (let tick = 1; tick <= 3; tick += 1) {
      const events = branch.combat.step(tick);
      ticks.push({ events, tick, ...observeCombat(branch.combat) });
    }
    branchOutputs.push({ name: branch.name, ticks });
  }
  assert.equal(branchOutputs[0].ticks[2].events.find(({ type }) =>
    type === "projectile-impact")?.status, "target_dead");

  const versionTwo = JSON.parse(combat.serialize());
  const versionOne = canonical({
    history: versionTwo.history,
    setup: versionTwo.setup,
    version: 1,
  });
  const legacyRestore = BattleCombat.restore(versionOne);
  assert.equal(legacyRestore.serialize(), combat.serialize());

  return {
    branchOutputs,
    checkpoints,
    legacyRestore: observeCombat(legacyRestore),
    legacyVersionOneBytes: versionOne,
    pendingBytes,
  };
}

function createCombatFactory(defineBattleCombat) {
  let issue, resolve;
  const definition = defineBattleCombat((copy, lookup) => {
    issue = copy;
    resolve = lookup;
  });
  return { ...definition, issue, resolve };
}

function callbackScopeEvidence(defineBattleCombat, canonicalBattleCombat) {
  const owner = createCombatFactory(defineBattleCombat);
  const other = createCombatFactory(defineBattleCombat);
  const canonicalInstance = new canonicalBattleCombat();
  assert.throws(() => owner.issue(canonicalInstance), TypeError);

  const ownerInstance = new owner.BattleCombat();
  const otherInstance = new other.BattleCombat();
  const ownerHandle = owner.issue(ownerInstance);
  const otherHandle = other.issue(otherInstance);
  assert.equal(Object.getPrototypeOf(ownerHandle), null);
  assert.equal(Object.isFrozen(ownerHandle), true);
  assert.deepEqual(Reflect.ownKeys(ownerHandle), []);
  assert.equal(owner.resolve(ownerHandle) instanceof owner.BattleCombat, true);
  assert.throws(() => owner.resolve(otherHandle), TypeError);
  assert.throws(() => other.resolve(ownerHandle), TypeError);

  let traps = 0;
  const hostileProxy = new Proxy(Object.create(null), {
    get() { traps += 1; throw new Error("hostile continuation trap"); },
    getPrototypeOf() { traps += 1; throw new Error("hostile continuation trap"); },
    ownKeys() { traps += 1; throw new Error("hostile continuation trap"); },
  });
  const revoked = Proxy.revocable(Object.create(null), {});
  revoked.revoke();
  for (const hostile of [Object.create(null), hostileProxy, revoked.proxy]) {
    assert.throws(() => owner.resolve(hostile), TypeError);
    assert.throws(() => owner.issue(hostile), TypeError);
  }
  assert.equal(traps, 0);

  return {
    canonicalReceiverRejected: true,
    crossFactoryHandlesRejected: true,
    handleShape: [Object.getPrototypeOf(ownerHandle) === null,
      Object.isFrozen(ownerHandle), Reflect.ownKeys(ownerHandle).length],
    hostileTraps: traps,
  };
}

function witnessSetup(id) {
  const witness = createSessionTroopWitness(id);
  const deck = witness.roster.map(({ id: cardId }) => cardId);
  let seed = 0;
  for (; seed < 10_000; seed += 1) {
    if (new DeckCycle({ deck, seed: `${seed}:south` }).state.hand.includes(id)) break;
  }
  assert.ok(seed < 10_000, `${id} has a legal eight-card opening hand`);
  return {
    battleSetup: canonical(witness),
    deck,
    legalNorthDeployments: [],
    projectileRuntimeProfiles: PROJECTILE_RECEIPT,
    rosterWitness: canonical({ questions: witness.questions, roster: witness.roster }),
    seed,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 3_600,
    thinkOffsetTicks: 0,
  };
}

function createSession(GameSession, id) {
  return new GameSession(canonical(witnessSetup(id)));
}

function deploy(session, id, commandId = 0) {
  const slot = session.state.decks.south.hand.indexOf(id);
  assert.notEqual(slot, -1, `${id} is in the authentic south opening hand`);
  return session.submitPlayerCommand(canonical({
    cardId: id,
    commandId,
    point: SOUTH,
    slot,
    tick: session.state.tick,
    type: "deploy",
  }));
}

function observeSession(session) {
  return {
    replayBytes: session.replayBytes(),
    serialized: session.serialize(),
    state: session.state,
  };
}

function runSessionReceiptFixture(GameSession, id) {
  const session = createSession(GameSession, id);
  const admission = deploy(session, id);
  const outputs = [];
  for (const ticks of [1, 17, 63, 369]) {
    const events = session.stepMany(ticks);
    outputs.push({ events, ticks, ...observeSession(session) });
  }
  return { admission, outputs, setup: canonical(witnessSetup(id)) };
}

function runPendingSessionLifecycle(GameSession, LiveBattle) {
  const id = "stormkite";
  const direct = createSession(GameSession, id);
  deploy(direct, id);
  const directEvents = direct.stepMany(450);
  const directBytes = direct.serialize();
  const directReplay = direct.replayBytes();

  const prefix = createSession(GameSession, id);
  deploy(prefix, id);
  prefix.stepMany(317);
  const pendingBytes = prefix.serialize();
  const pendingRestore = GameSession.restore(pendingBytes);
  const pendingRuntime = pendingRestore.state.battle.projectileRuntime;
  assert.equal(pendingRuntime.pending.length, 1);
  pendingRestore.stepMany(133);
  assert.equal(pendingRestore.serialize(), directBytes);
  assert.equal(pendingRestore.replayBytes(), directReplay);

  const restoreCuts = [];
  for (const cut of [0, 315, 317, 322, 450]) {
    const cutSession = createSession(GameSession, id);
    deploy(cutSession, id);
    cutSession.stepMany(cut);
    const restored = GameSession.restore(cutSession.serialize());
    restored.stepMany(450 - cut);
    restoreCuts.push({
      cut,
      replayBytes: restored.replayBytes(),
      serialized: restored.serialize(),
    });
    assert.equal(restored.serialize(), directBytes, `restore cut ${cut}`);
    assert.equal(restored.replayBytes(), directReplay, `replay cut ${cut}`);
  }

  const battleSetup = JSON.stringify(JSON.parse(witnessSetup(id).battleSetup));
  const battle = new LiveBattle(battleSetup, undefined, undefined, PROJECTILE_RECEIPT);
  battle.scheduleDeploy(canonical({
    cardId: id,
    point: SOUTH,
    sequence: 0,
    side: "south",
    tick: 0,
  }));
  battle.stepMany(317);
  const fork = battle.fork();
  const pendingForkBytes = fork.serialize();
  assert.equal(pendingForkBytes, battle.serialize());
  battle.stepMany(1);
  fork.stepMany(1);
  assert.equal(fork.serialize(), battle.serialize());

  return {
    direct: { events: directEvents, replayBytes: directReplay, serialized: directBytes },
    fork: { afterAdvance: fork.serialize(), pending: pendingForkBytes },
    pending: {
      bytes: pendingBytes,
      runtime: pendingRuntime,
      restored: { replayBytes: pendingRestore.replayBytes(), serialized: pendingRestore.serialize() },
    },
    restoreCuts,
  };
}

function registrationSource(source) {
  const start = source.indexOf("const combat = defineBattleCombat(");
  const end = source.indexOf("const liveBattle = defineLiveBattle(", start);
  assert.notEqual(start, -1, "combat registry callsite exists");
  assert.notEqual(end, -1, "live battle registry callsite exists");
  return source.slice(start, end);
}

async function loadBaselineKernel(context, baselineRoot) {
  const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
  const sourceRoot = join(repositoryRoot, "src");
  const temporaryRoot = mkdtempSync(join(tmpdir(), "battle-combat-baseline-"));
  context.after(() => rmSync(temporaryRoot, { recursive: true, force: true }));

  const stagedSource = join(temporaryRoot, "src");
  mkdirSync(stagedSource);
  const baselineAdapters = new Map([
    ["battle-combat.js", "src/sim/battle-combat.js"],
    ["game-session.js", "src/sim/game-session.js"],
    ["live-battle.js", "src/sim/live-battle.js"],
  ]);
  for (const entry of readdirSync(sourceRoot)) {
    const original = join(sourceRoot, entry);
    const staged = join(stagedSource, entry);
    if (entry !== "sim") {
      symlinkSync(original, staged, statSync(original).isDirectory() ? "dir" : "file");
      continue;
    }
    mkdirSync(staged);
    for (const simEntry of readdirSync(original)) {
      const originalModule = join(original, simEntry);
      const stagedModule = join(staged, simEntry);
      if (simEntry === "battle-continuation-kernel.js") continue;
      if (baselineAdapters.has(simEntry)) {
        const baselinePath = baselineAdapters.get(simEntry);
        const baselineAdapter = readAcceptedBaselineSource(baselineRoot, baselinePath);
        assert.equal(sha256(readFileSync(originalModule)), ACCEPTED_SOURCE_HASHES[baselinePath],
          `${baselinePath} candidate remains the accepted e476 adapter source`);
        writeFileSync(stagedModule, baselineAdapter);
        continue;
      }
      symlinkSync(originalModule, stagedModule,
        statSync(originalModule).isDirectory() ? "dir" : "file");
    }
  }
  writeFileSync(join(temporaryRoot, "package.json"), '{"type":"module"}\n');

  const baselineSourceBytes = readAcceptedBaselineSource(
    baselineRoot,
    "src/sim/battle-continuation-kernel.js",
  );
  const baselineSource = baselineSourceBytes.toString("utf8");
  const factoryMarker = "function defineBattleCombat(registerCompact)";
  assert.equal(baselineSource.split(factoryMarker).length - 1, 1);
  const stagedKernel = join(stagedSource, "sim", "battle-continuation-kernel.js");
  writeFileSync(stagedKernel, baselineSource.replace(
    factoryMarker,
    "export function defineBattleCombat(registerCompact)",
  ));

  const stagedBattleCombat = await import(pathToFileURL(
    join(stagedSource, "sim", "battle-combat.js"),
  ).href);
  const stagedGameSession = await import(pathToFileURL(
    join(stagedSource, "sim", "game-session.js"),
  ).href);
  const stagedLiveBattle = await import(pathToFileURL(
    join(stagedSource, "sim", "live-battle.js"),
  ).href);
  return {
    battleCombat: stagedBattleCombat,
    kernel: await import(pathToFileURL(stagedKernel).href),
    gameSession: stagedGameSession,
    liveBattle: stagedLiveBattle,
    source: baselineSource,
  };
}

test("shared combat factory extraction matches accepted e476 source bytes and host identities", async (context) => {
  const baselineRoot = acceptedBaselinePath(context);
  if (baselineRoot === null) return;
  const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
  for (const [relativePath, expectedHash] of Object.entries(CANDIDATE_SOURCE_HASHES)) {
    assert.equal(sha256(readFileSync(join(repositoryRoot, relativePath))), expectedHash,
      `${relativePath} candidate source hash`);
  }
  const baseline = await loadBaselineKernel(context, baselineRoot);
  const currentSource = readFileSync(new URL(
    "../src/sim/battle-continuation-kernel.js", import.meta.url,
  ), "utf8");
  assert.equal(registrationSource(currentSource), registrationSource(baseline.source),
    "combat, tower, current-tick, and structure-contact registration remains byte-identical");

  const baselineOutput = runCombatProjectileFixture(baseline.battleCombat.BattleCombat);
  const extractedOutput = runCombatProjectileFixture(ExtractedBattleCombat);
  assert.equal(canonical(extractedOutput), canonical(baselineOutput),
    "legacy restore, pending projectile, impact, fork, and restore-cut bytes match accepted e476 source snapshot");

  const baselineScope = callbackScopeEvidence(
    baseline.kernel.defineBattleCombat,
    baseline.battleCombat.BattleCombat,
  );
  const extractedScope = callbackScopeEvidence(
    extractedDefineBattleCombat,
    ExtractedBattleCombat,
  );
  assert.deepEqual(extractedScope, baselineScope,
    "factory callbacks retain independent runtime and opaque-handle identity scopes");
});

test("shared combat factory extraction preserves receipt-backed GameSession and tower output", async (context) => {
  const baselineRoot = acceptedBaselinePath(context);
  if (baselineRoot === null) return;
  const baseline = await loadBaselineKernel(context, baselineRoot);
  const profileIds = MANIFEST.profiles.map(({ id }) => id);
  assert.ok(profileIds.includes("stormkite"), "the existing pending-projectile receipt fixture exists");

  for (const id of profileIds) {
    assert.deepEqual(
      runSessionReceiptFixture(ExtractedGameSession, id),
      runSessionReceiptFixture(baseline.gameSession.GameSession, id),
      `${id} deployment, tick chunks, replay, and serialized GameSession bytes`,
    );
  }

  assert.deepEqual(
    runPendingSessionLifecycle(ExtractedGameSession, ExtractedLiveBattle),
    runPendingSessionLifecycle(
      baseline.gameSession.GameSession,
      baseline.liveBattle.LiveBattle,
    ),
    "pending stormkite projectile restore cuts, live-battle fork, and tower contacts match",
  );
});
