import { ProjectileCombat } from '../../../src/sim/projectile.js';

function projectileEntity(id, position, overrides = {}) {
  return {
    attackRange: 10_000, id, kind: 'troop', layer: 'ground', maxHealth: 1000,
    position, radius: 0, targetMode: 'air_and_ground', targetable: true, ...overrides,
  };
}

for (const futureCount of [3000, 5000]) {
  const targetId = 9_000_000;
  const sources = Array.from({ length: futureCount }, (_, index) => index < 10
    ? 1_000_000_000_000_000 + index : 10_000 + index);
  const combat = new ProjectileCombat({ entities: [
    projectileEntity(1, { x: 0, y: 0 }), projectileEntity(2, { x: 0, y: 0 }),
    projectileEntity(3, { x: 0, y: 0 }),
    ...sources.map((id) => projectileEntity(id, { x: 0, y: 0 }, { attackRange: 32_000 })),
    projectileEntity(targetId, { x: 18_000, y: 0 }),
  ] });
  for (const attackerId of [1, 2]) {
    combat.launch({ attackerId, damage: 0, radius: 0, speed: 1000, targetId: 3, tick: 0 });
  }
  let accepted = 0;
  let failure = null;
  for (const attackerId of sources) {
    try {
      combat.launch({ attackerId, damage: 0, radius: 0, speed: 1, targetId, tick: 0 });
      accepted += 1;
    } catch (error) {
      failure = error.message;
      break;
    }
  }
  console.log(JSON.stringify({
    accepted, feedBytes: new TextEncoder().encode(combat.combatEffectFeedBytes()).byteLength,
    failure, futureCount,
  }));
}
