import { createHash } from "node:crypto";

import * as content from "../../src/content/index.js";
import { createSessionTroopWitness } from "../../src/content/session-troop-roster.js";
import {
  BasicFlyingDuel,
  BasicRangedDuel,
  ChampionAbilityController,
  DefensiveBuildingEncounter,
  InstantHealingEncounter,
  PeriodicAreaSpellEncounter,
  SPAWNER_BUILDING_IDENTITIES,
  SPAWN_SPELL_IDENTITIES,
  SpawnSpellEncounter,
  SpawnerBuildingEncounter,
  createBasicFlyingCombatant,
  createBasicMeleeCombatant,
  createBasicRangedCombatant,
  createChampionAbilityFixture,
  createDefensiveBuildingFixture,
  createHealFixture,
  createHealQuestionRecords,
  createPeriodicSpellFixture,
  createSpawnerBuildingFixture,
  createSpawnSpellFixture,
} from "../../src/content/index.js";
import { DamageSystem } from "../../src/sim/damage.js";
import { LiveBattle } from "../../src/sim/live-battle.js";
import { MeleeDuel } from "../../src/sim/melee.js";

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

function recordsFor(specification) {
  const value = content[specification.exportName];
  let records;
  if (typeof value === "function") records = value();
  else if (Array.isArray(value)) records = value;
  else if (value && typeof value === "object" && typeof value.id === "string") {
    records = [value];
  } else if (value && typeof value === "object") {
    records = Object.values(value);
  } else {
    throw new Error(`${specification.exportName} is not callable evidence`);
  }
  const record = records.find(({ id }) => id === specification.id);
  if (!record) {
    throw new Error(
      `${specification.exportName} did not return ${specification.id}`,
    );
  }
  return record;
}

function replayOf(encounter) {
  if (Array.isArray(encounter.replay)) return encounter.replay;
  if (Array.isArray(encounter.state?.history)) return encounter.state.history;
  if (Array.isArray(encounter.state?.events)) return encounter.state.events;
  return [];
}

function directBytes(specification, facade, record, state, emitted, replay) {
  const exportCall = {
    exportName: specification.exportName,
    result: record,
  };
  const eventBytes = canonical({
    exportCall,
    mechanic: { emitted, facade },
  });
  const replayBytes = canonical({
    exportCall,
    mechanic: { facade, replay },
  });
  const stateBytes = canonical({
    exportCall,
    mechanic: { facade, state },
  });
  return {
    bindingSha256: sha256(canonical({
      eventBytes,
      replayBytes,
      stateBytes,
    })),
    eventBytes,
    exportName: specification.exportName,
    id: specification.id,
    replayBytes,
    selector: specification.selector,
    stateBytes,
  };
}

function encounterArtifact(specification, encounter, advance) {
  const record = recordsFor(specification);
  const advanced = advance(encounter);
  const replay = replayOf(encounter);
  if (!Array.isArray(replay) || replay.length === 0) {
    throw new Error(`${specification.exportName}/${specification.id} emitted no replay`);
  }
  const emitted = Array.isArray(advanced) && advanced.length === 0
    ? replay
    : advanced;
  return directBytes(
    specification,
    encounter.constructor.name,
    record,
    encounter.state,
    emitted,
    replay,
  );
}

function duelArtifact(specification, Duel, combatants) {
  const duel = new Duel({ combatants });
  return encounterArtifact(specification, duel, (value) => {
    value.run(1_000);
    return value.replay;
  });
}

function basicMelee(specification) {
  const placement = (entityId, position) => ({
    entityId,
    position,
    radius: 500,
  });
  return duelArtifact(specification, MeleeDuel, [
    createBasicMeleeCombatant(
      specification.id,
      placement(101, 0),
    ),
    createBasicMeleeCombatant(
      specification.id,
      placement(202, 1_800),
    ),
  ]);
}

function basicRanged(specification) {
  return duelArtifact(specification, BasicRangedDuel, [
    createBasicRangedCombatant(specification.id, 101),
    createBasicRangedCombatant(specification.id, 202),
  ]);
}

function basicFlying(specification) {
  return duelArtifact(specification, BasicFlyingDuel, [
    createBasicFlyingCombatant(specification.id, 101),
    createBasicFlyingCombatant(specification.id, 202),
  ]);
}

function swarm(specification) {
  const record = recordsFor(specification);
  const members = content.createSquadMembers(specification.id, 101);
  const damage = new DamageSystem();
  for (const member of members) damage.add(member.id, member.hitpoints);
  const result = damage.damageSimultaneously(members.map((member) => ({
    amount: member.hitpoints,
    targetId: member.id,
  })));
  if (result.events.filter(({ type }) => type === "death").length !==
    members.length) {
    throw new Error(`${specification.id} interaction did not kill its squad`);
  }
  return directBytes(
    specification,
    "createSquadMembers+DamageSystem",
    record,
    damage.list(),
    result.events,
    result.events,
  );
}

function ordinaryProjectileSquad(specification) {
  const record = recordsFor(specification);
  const witness = createSessionTroopWitness(specification.id);
  const squad = witness.roster.find(({ id }) => id === specification.id);
  const intervals = squad?.entities.map(({ sourceConfidencePolicy }) =>
    sourceConfidencePolicy?.deploymentInterval);
  if (!intervals?.length || intervals.some((interval) =>
    interval?.milliseconds !== 100 ||
    interval.sourceId !== "supercell-2020-06-02-multi-unit-deployment" ||
    interval.ticks !== intervals[0].ticks)) {
    throw new Error(`${specification.id} lacks a consistent source-derived deployment interval`);
  }
  const intervalTicks = intervals[0].ticks;
  const battle = new LiveBattle(canonical(witness));
  const scheduled = battle.scheduleDeploy(canonical({
    cardId: specification.id,
    point: { x: 3_500, y: 14_500 },
    sequence: 0,
    side: "south",
    tick: 0,
  }));
  if (scheduled.type !== "deploy-scheduled") {
    throw new Error(`${specification.id} shared deployment was not admitted`);
  }
  const emitted = [...battle.step()];
  const count = (candidate) => candidate.state.units.filter(({ cardId }) =>
    cardId === specification.id).length;
  if (battle.state.tick !== 1 || count(battle) !== 1) {
    throw new Error(`${specification.id} did not materialize exactly its first member at tick 1`);
  }
  const checkpoint = battle.serialize();
  const restored = LiveBattle.restore(checkpoint);
  if (restored.serialize() !== checkpoint) {
    throw new Error(`${specification.id} partial squad checkpoint did not restore exactly`);
  }
  for (let elapsedTicks = 1; elapsedTicks <= intervalTicks * (record.count - 1);
    elapsedTicks += 1) {
    const forwardEvents = battle.step();
    const restoredEvents = restored.step();
    const expectedCount = Math.min(record.count,
      1 + Math.floor(elapsedTicks / intervalTicks));
    if (count(battle) !== expectedCount || count(restored) !== expectedCount) {
      throw new Error(`${specification.id} birth count diverged at tick ${battle.state.tick}`);
    }
    if (canonical(forwardEvents) !== canonical(restoredEvents) ||
        battle.serialize() !== restored.serialize()) {
      throw new Error(`${specification.id} partial squad restore diverged at tick ${battle.state.tick}`);
    }
    emitted.push(...forwardEvents);
  }
  if (count(battle) !== record.count) {
    throw new Error(`${specification.id} did not complete its source-derived member schedule`);
  }
  return directBytes(
    specification,
    "LiveBattle+canonical session troop witness",
    record,
    battle.state,
    emitted,
    battle.replay,
  );
}

function heal(specification) {
  const questions = createHealQuestionRecords();
  const amount = specification.id === "bloom-wisp"
    ? questions.bloomWispHealAmount.value
    : questions.dawnmenderHealAmount.value;
  const encounter = new InstantHealingEncounter(createHealFixture([
    {
      currentHealth: 1_000,
      id: 1,
      kind: "troop",
      maxHealth: 1_000,
      ownerId: 1,
    },
    {
      currentHealth: 1,
      id: 2,
      kind: "troop",
      maxHealth: 1_000,
      ownerId: 1,
    },
  ], [{
    amount,
    sourceId: 1,
    targetId: 2,
    tick: 0,
    type: "heal",
  }]));
  return encounterArtifact(specification, encounter, (value) =>
    value.stepMany(1)
  );
}

function defensiveBuilding(specification) {
  const firstInteractionTicks = {
    "bulwark-needle": 61,
    "buried-coil": 103,
    "ember-basin": 127,
    "horizon-caster": 451,
    "prism-furnace": 133,
  };
  const origin = { x: 9_000, y: 12_000 };
  const encounter = new DefensiveBuildingEncounter(
    createDefensiveBuildingFixture([{
      archetypeId: specification.id,
      destroyedOpposingLaneTowers: [],
      id: 1,
      position: origin,
      side: "south",
    }], [{
      health: 5_000,
      id: 2,
      kind: "troop",
      layer: "ground",
      position: {
        x: specification.id === "horizon-caster" ? 12_000 : 11_000,
        y: 12_000,
      },
      radius: 0,
      targetable: true,
    }], []),
  );
  return encounterArtifact(specification, encounter, (value) =>
    value.stepMany(firstInteractionTicks[specification.id])
  );
}

function spawnerBuilding(specification) {
  if (!Object.hasOwn(SPAWNER_BUILDING_IDENTITIES, specification.id)) {
    throw new Error(`unknown spawner ${specification.id}`);
  }
  const encounter = new SpawnerBuildingEncounter(
    createSpawnerBuildingFixture([{
      archetypeId: specification.id,
      destroyedOpposingLaneTowers: [],
      id: 101,
      ownerId: 7,
      position: { x: 9_000, y: 12_000 },
      side: "south",
    }], []),
  );
  return encounterArtifact(specification, encounter, (value) => value.run());
}

function spawnSpell(specification) {
  const identity = SPAWN_SPELL_IDENTITIES.find(({ id }) =>
    id === specification.id
  );
  if (!identity) throw new Error(`unknown spawn spell ${specification.id}`);
  const encounter = new SpawnSpellEncounter(createSpawnSpellFixture({
    commands: [{
      center: { x: 9_000, y: 16_000 },
      id: 1,
      sourceId: 41,
      tick: 0,
      type: "cast",
      variant: identity.variant,
    }],
    seed: `integration-${specification.id}`,
    sources: [{ id: 41, ownerId: 7 }],
  }));
  return encounterArtifact(specification, encounter, (value) => value.run());
}

function periodicSpell(specification) {
  const encounter = new PeriodicAreaSpellEncounter(createPeriodicSpellFixture({
    commands: [{
      center: { x: 9_000, y: 16_000 },
      id: 1,
      sourceId: 1,
      targetId: null,
      tick: 0,
      type: "cast",
      variant: specification.id,
    }],
    sources: [{ id: 1, ownerId: 1 }],
    targets: [{
      health: 1_000,
      id: 2,
      kind: "troop",
      layer: "ground",
      ownerId: 2,
      position: { x: 9_000, y: 16_000 },
      radius: 0,
      targetable: true,
    }],
  }));
  return encounterArtifact(specification, encounter, (value) => value.run());
}

function champion(specification) {
  const encounter = new ChampionAbilityController(createChampionAbilityFixture(
    [{ elixir: 10, id: 1 }],
    [{ archetypeId: specification.id, entityId: 101, ownerId: 1 }],
    [
      { entityId: 101, tick: 0, type: "deploy" },
      { entityId: 101, tick: 1, type: "activate" },
    ],
  ));
  return encounterArtifact(specification, encounter, (value) =>
    value.stepMany(3)
  );
}

function advanceUntilReplay(encounter) {
  const emitted = [];
  for (let index = 0; index < 20_000 && replayOf(encounter).length === 0;
    index += 1) {
    if (encounter.state?.terminal === true) break;
    if (typeof encounter.step === "function") {
      const value = encounter.step();
      if (Array.isArray(value)) emitted.push(...value);
      else if (value !== undefined) emitted.push(value);
    } else if (typeof encounter.command === "function") {
      break;
    } else {
      break;
    }
  }
  return emitted;
}

function defaultFacade(className, fixtureName = null) {
  return (specification) => {
    const Runtime = content[className];
    const fixture = fixtureName === null ? undefined : content[fixtureName]();
    const encounter = fixtureName === null
      ? new Runtime()
      : new Runtime(fixture);
    return encounterArtifact(
      specification,
      encounter,
      advanceUntilReplay,
    );
  };
}

function shieldForm(specification) {
  const encounter = new content.ShieldFormEncounter();
  return encounterArtifact(specification, encounter, (value) =>
    value.damage(892)
  );
}

function retarget(specification) {
  const encounter = new content.RetargetAttackEncounter(
    content.createRetargetFixture([{
      alive: true,
      health: 1_000,
      id: 201,
      kind: "troop",
      layer: "ground",
      position: { x: 1_000, y: 0 },
      radius: 0,
      targetable: true,
    }], []),
  );
  return encounterArtifact(specification, encounter, (value) =>
    value.stepMany(103)
  );
}

function command(sourceId, targetId, tick, type) {
  return { sourceId, targetId, tick, type };
}

function statusFacade(className, fixtureName, commands, ticks) {
  return (specification) => {
    const encounter = new content[className](
      content[fixtureName](commands),
    );
    return encounterArtifact(specification, encounter, (value) =>
      value.stepMany(ticks)
    );
  };
}

function invisibility(specification) {
  const encounter = new content.InvisibilityRevealEncounter(
    content.createInvisibilityFixture([{
      alive: true,
      health: 1_000,
      id: 7,
      kind: "troop",
      layer: "ground",
      position: { x: 1_000, y: 0 },
      radius: 0,
    }], [{
      sourceId: 90,
      targetId: 7,
      tick: 0,
      type: "hide",
    }]),
  );
  return encounterArtifact(specification, encounter, (value) =>
    value.stepMany(1)
  );
}

function resourceBuilding(specification) {
  const encounter = new content.ResourceBuildingEncounter(
    content.createResourceBuildingFixture([{
      destroyedOpposingLaneTowers: [],
      id: 1,
      position: { x: 9_001, y: 12_000 },
      side: "south",
    }], [], { north: 0, south: 0 }),
  );
  return encounterArtifact(specification, encounter, (value) =>
    value.stepMany(61)
  );
}

function travelBuilding(specification) {
  const encounter = new content.UndergroundTravelBuildingEncounter(
    content.createUndergroundTravelBuildingFixture([{
      destination: { x: 2_500, y: 12_500 },
      destroyedOpposingLaneTowers: [],
      id: 1,
      origin: { x: 2_500, y: 10_500 },
      ownerId: 7,
      side: "south",
    }], []),
  );
  return encounterArtifact(specification, encounter, (value) =>
    value.stepMany(61)
  );
}

const SPELL_SOURCE = Object.freeze({
  id: 1,
  ownerId: 1,
  position: Object.freeze({ x: 1_000, y: 1_000 }),
});

function spellVictim(position = { x: 5_000, y: 1_000 }, radius = 0) {
  return {
    combatTargetId: null,
    combatTargetMode: null,
    health: 1_000,
    id: 10,
    kind: "troop",
    layer: "ground",
    ownerId: 2,
    position,
    radius,
    targetable: true,
  };
}

function runSpell(specification, className, fixture) {
  const encounter = new content[className](fixture);
  return encounterArtifact(specification, encounter, (value) => value.run());
}

function instantSpell(specification) {
  return runSpell(
    specification,
    "InstantRadiusSpellEncounter",
    content.createInstantSpellFixture({
      commands: [{
        center: { x: 9_000, y: 16_000 },
        id: 1,
        sourceId: 1,
        targetId: null,
        tick: 0,
        type: "cast",
        variant: "plain",
      }],
      sources: [{ id: 1, ownerId: 1 }],
      victims: [spellVictim({ x: 9_000, y: 16_000 })],
    }),
  );
}

function travelingLineSpell(specification) {
  return runSpell(
    specification,
    "TravelingLineSpellEncounter",
    content.createTravelingLineSpellFixture({
      commands: [{
        center: { x: 6_000, y: 1_000 },
        effectId: null,
        id: 1,
        sourceId: 1,
        targetId: null,
        tick: 0,
        type: "cast",
      }],
      sources: [SPELL_SOURCE],
      victims: [spellVictim({ x: 5_000, y: 1_000 }, 100)],
    }),
  );
}

function returningSpell(specification) {
  return runSpell(
    specification,
    "ReturningSpellEncounter",
    content.createReturningSpellFixture({
      commands: [{
        center: { x: 5_000, y: 1_000 },
        effectId: null,
        id: 1,
        sourceId: 1,
        targetId: null,
        tick: 0,
        type: "cast",
      }],
      sources: [SPELL_SOURCE],
      victims: [spellVictim({ x: 2_000, y: 1_000 })],
    }),
  );
}

function threeWaveSpell(specification) {
  return runSpell(
    specification,
    "ThreeWaveTravelingSpellEncounter",
    content.createThreeWaveTravelingSpellFixture({
      commands: [{
        center: { x: 6_000, y: 1_000 },
        effectId: null,
        id: 1,
        sourceId: 1,
        targetId: null,
        tick: 0,
        type: "cast",
      }],
      sources: [SPELL_SOURCE],
      victims: [spellVictim({ x: 6_000, y: 1_000 }, 100)],
    }),
  );
}

function rollingSpell(specification) {
  return runSpell(
    specification,
    "RollingSpellEncounter",
    content.createRollingSpellFixture({
      commands: [{
        center: { x: 9_000, y: 1_000 },
        effectId: null,
        id: 1,
        obstacleId: null,
        sourceId: 1,
        targetId: null,
        tick: 0,
        type: "cast",
      }],
      obstacles: [],
      sources: [SPELL_SOURCE],
      victims: [spellVictim()],
    }),
  );
}

const ADAPTER_ENTRIES = [
  ["createBasicFlyingCatalog", basicFlying],
  ["createBasicMeleeCatalog", basicMelee],
  ["createBasicRangedCatalog", basicRanged],
  ["createOrdinaryProjectileSquadCatalog", ordinaryProjectileSquad],
  ["createChampionAbilityCatalog", champion],
  ["createDefensiveBuildingCatalog", defensiveBuilding],
  ["createHealCatalog", heal],
  ["createPeriodicSpellCatalog", periodicSpell],
  ["createSwarmCatalog", swarm],
  ["SPAWNER_BUILDING_IDENTITIES", spawnerBuilding],
  ["SPAWN_SPELL_IDENTITIES", spawnSpell],
  ["DEATH_SPAWN_IDENTITY",
    defaultFacade("DeathSpawnEncounter", "createDeathSpawnFixture")],
  ["DEATH_CONVERSION_IDENTITY",
    defaultFacade("DeathConversionEncounter", "createDeathConversionFixture")],
  ["createStructureSeekerCatalog",
    defaultFacade("StructureSeekerEncounter", "createStructureSeekerFixture")],
  ["createShieldFormCatalog", shieldForm],
  ["createChargeSpecialCatalog",
    defaultFacade("ChargeSpecialEncounter", "createChargeSpecialFixture")],
  ["createDashSpecialCatalog",
    defaultFacade("DashEncounter", "createDashSpecialFixture")],
  ["createJumpSpecialCatalog",
    defaultFacade("JumpEncounter", "createJumpSpecialFixture")],
  ["createRecoilSpecialCatalog",
    defaultFacade("RecoilEncounter", "createRecoilSpecialFixture")],
  ["createKnockbackSpecialCatalog",
    defaultFacade("ForcedKnockbackEncounter", "createKnockbackSpecialFixture")],
  ["createRetargetSpecialCatalog", retarget],
  ["createChargeKnockbackCatalog",
    defaultFacade(
      "ChargeKnockbackRetargetEncounter",
      "createChargeKnockbackFixture",
    )],
  ["createChainSpecialCatalog",
    defaultFacade("ChainEncounter", "createChainSpecialFixture")],
  ["createPierceSpecialCatalog",
    defaultFacade("PierceEncounter", "createPierceSpecialFixture")],
  ["createReturnSpecialCatalog",
    defaultFacade("ReturnEncounter", "createReturnSpecialFixture")],
  ["createPelletSpecialCatalog",
    defaultFacade("PelletEncounter", "createPelletSpecialFixture")],
  ["createReflectionSpecialCatalog",
    defaultFacade("ReflectionEncounter", "createReflectionSpecialFixture")],
  ["createRampSpecialCatalog", statusFacade(
    "ConsecutiveTargetRampEncounter",
    "createRampFixture",
    [{ targetId: 7, tick: 0, type: "target-acquired" }],
    1,
  )],
  ["createResetSpecialCatalog", statusFacade(
    "InstantaneousCombatResetEncounter",
    "createResetFixture",
    [
      command(null, 7, 0, "acquire-target"),
      command(91, 7, 1, "reset"),
    ],
    2,
  )],
  ["createStunSpecialCatalog", statusFacade(
    "TimedFullDisableStunEncounter",
    "createStunFixture",
    [command(null, 7, 0, "acquire-target"), command(99, null, 1, "stun")],
    2,
  )],
  ["createSlowSpecialCatalog", statusFacade(
    "TimedMovementAttackSlowEncounter",
    "createSlowFixture",
    [command(null, 7, 0, "acquire-target"), command(99, null, 1, "slow")],
    2,
  )],
  ["createRageSpecialCatalog", statusFacade(
    "TimedMovementAttackRageEncounter",
    "createRageFixture",
    [
      command(null, 7, 0, "acquire-target"),
      command(99, null, 1, "accelerate"),
    ],
    2,
  )],
  ["createSnareSpecialCatalog", statusFacade(
    "TimedMovementOnlySnareEncounter",
    "createSnareFixture",
    [command(null, 7, 0, "acquire-target"), command(99, null, 1, "snare")],
    2,
  )],
  ["createDeathEffectsCatalog",
    defaultFacade("DeathEffectsEncounter", "createDeathEffectsFixture")],
  ["createInvisibilitySpecialCatalog", invisibility],
  ["createResourceBuildingCatalog", resourceBuilding],
  ["createUndergroundTravelBuildingCatalog", travelBuilding],
  ["createInstantSpellCatalog", instantSpell],
  ["createTravelingLineSpellCatalog", travelingLineSpell],
  ["createReturningSpellCatalog", returningSpell],
  ["createThreeWaveTravelingSpellCatalog", threeWaveSpell],
  ["createRollingSpellCatalog", rollingSpell],
];
const adapterNames = ADAPTER_ENTRIES.map(([exportName]) => exportName);
if (new Set(adapterNames).size !== adapterNames.length) {
  throw new Error("direct occurrence adapter exports must be unique");
}
const ADAPTERS = new Map(ADAPTER_ENTRIES);

const specifications = JSON.parse(
  process.env.INTEGRATION_AUDIT_OCCURRENCES ?? "null",
);
if (!Array.isArray(specifications)) {
  throw new TypeError("integration occurrence adapter requires specifications");
}

const artifacts = specifications.map((specification) => {
  const adapter = ADAPTERS.get(specification.exportName);
  if (!adapter) {
    throw new Error(`no direct multi-card adapter for ${specification.exportName}`);
  }
  return adapter(specification);
}).sort((left, right) =>
  left.id.localeCompare(right.id) ||
  left.exportName.localeCompare(right.exportName)
);

process.stdout.write(`${canonical({ artifacts, version: 3 })}\n`);
