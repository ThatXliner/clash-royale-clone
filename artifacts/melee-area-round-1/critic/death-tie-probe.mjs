import { BattleCombat } from "../candidate/src/sim/battle-combat.js";
const policy = Object.freeze({
  authoritative: false,
  center: "attacker",
  confidence: "question",
  geometry: "circle-overlap-inclusive",
  radiusMillitiles: 2_000,
  secondaryDamage: "base-attack",
  structureTargets: "exclude",
  targetLayers: Object.freeze(["ground"]),
  version: "melee-area-question-v1",
});
const unit = (id, side, position, overrides = {}) => ({
  cadenceTicks: 10,
  damage: 10,
  delivery: "melee",
  deployTicks: 0,
  firstHitTicks: 0,
  id,
  layer: "ground",
  maxHealth: 10,
  position: { x: position, y: 0 },
  projectileSpeed: null,
  radius: 100,
  reach: 1_000,
  side,
  sightRange: 5_000,
  targetMode: "ground",
  ...overrides,
});
const combat = new BattleCombat({
  meleeAreaPolicies: [{ attackerId: 1, policy }],
  units: [
    unit(1, "north", 100_000),
    unit(2, "south", 100_500),
    unit(3, "south", 101_000, { damage: 0, targetMode: "none" }),
  ],
});
const ticks = [];
for (let tick = 0; tick < 5; tick += 1) {
  const events = combat.stepBoundary({
    externalHits: [], externalProjectiles: [], structures: [], tick,
  });
  ticks.push({
    tick,
    damage: events.filter(({ type }) => type === "damage"),
    deaths: events.filter(({ type }) => /death/u.test(type)),
    state: combat.state.units.map(({ id, hitpoints, alive }) => ({ id, hitpoints, alive })),
  });
  if (combat.state.units.every(({ alive }) => !alive)) break;
}
process.stdout.write(`${JSON.stringify(ticks, null, 2)}\n`);
