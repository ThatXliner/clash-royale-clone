import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const root = "/private/tmp/cards019i-integration-scope";
const { BattleTowerCombat } = await import(`${root}/src/sim/battle-towers.js`);
const {
  createCombatEffectsViewModel,
  serializeCombatEffectsViewModel,
  restoreCombatEffectsViewModel,
} = await import(`${root}/src/ui/combat-effects.js`);
const { AudioEventProjection } = await import(`${root}/src/audio/audio-events.js`);

const unit = {
  cadenceTicks: 60,
  damage: 25,
  delivery: "projectile",
  deployTicks: 0,
  firstHitTicks: 0,
  id: 9,
  layer: "ground",
  maxHealth: 500,
  position: { x: 3_500, y: 7_500 },
  projectileSpeed: 1_000,
  radius: 100,
  reach: 5_000,
  side: "north",
  sightRange: 5_000,
  targetMode: "ground",
};
const battle = new BattleTowerCombat({
  initialWindupTicks: { central: 999, lane: 0 },
  units: [unit],
});
const firstBatch = battle.step(0);
const runtimeEvents = [...battle.replay];
const identities = runtimeEvents
  .filter((event) => event.projectileIdentity)
  .map(({ type, projectileIdentity }) => ({ type, ...projectileIdentity }));
const localIdOne = identities.filter(({ projectileId }) => projectileId === 1);
const feed = battle.combatEffectFeed;
const tick = 0;
const view = createCombatEffectsViewModel(feed, tick);
const viewBytes = serializeCombatEffectsViewModel(view);
const restoredViewBytes = serializeCombatEffectsViewModel(restoreCombatEffectsViewModel(viewBytes));
const audio = new AudioEventProjection();
const audioRecords = audio.projectBatch(runtimeEvents.map((event, sequence) => ({
  event,
  sequence,
  tick: event.tick ?? 0,
})));
const sourceFiles = [
  "src/sim/battle-continuation-kernel.js",
  "src/sim/combat-effect-feed.js",
  "src/ui/combat-effects.js",
  "src/ui/game-ui-projection.js",
  "src/ui/combat-motion.js",
  "src/audio/audio-events.js",
  "src/audio/game-audio-runtime.js",
];
const result = {
  source: {
    revision: "6198883470fa48f6746974d7590168ae3011ac37",
    note: "clean accepted pre-integration source used for this namespace probe; post-019K core admission makes the UI choice count an interim observation, not accepted CARDS-019I presentation",
    sha256: Object.fromEntries(sourceFiles.map((file) => [
      file,
      createHash("sha256").update(readFileSync(`${root}/${file}`)).digest("hex"),
    ])),
  },
  fixture: {
    kind: "actual BattleTowerCombat runtime fixture",
    call: "BattleTowerCombat.step(0)",
    unit: { id: 9, side: "north", position: unit.position, delivery: unit.delivery, projectileSpeed: unit.projectileSpeed },
    firstBatchTypes: firstBatch.map(({ type }) => type),
    battleTickAfterStep: null,
  },
  projectileIdentities: identities,
  sharedLocalProjectileIdOne: localIdOne,
  effectFeed: {
    rootIds: feed.records.filter(({ phase }) => phase === "open").map(({ rootId }) => rootId),
    recordCount: feed.records.length,
    viewAtTick: tick,
    projectileKeys: view.projectiles.map(({ key }) => key),
    impactKeys: view.impacts.map(({ key }) => key),
    restoreBytesEqual: viewBytes === restoredViewBytes,
  },
  audioProjection: {
    recordCount: audioRecords.length,
    records: audioRecords.map(({ cueId, family, reason, sequence, type }) => ({ cueId, family, reason, sequence, type })),
    hasOneRecordPerRuntimeEvent: audioRecords.length === runtimeEvents.length,
    snapshotBytes: audio.serialize().length,
  },
};
const output = "/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/cards019i-integration-scope/builder/projectile-identity-runtime-probe.json";
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
