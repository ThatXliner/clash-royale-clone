import assert from 'node:assert/strict';
import { LiveBattle } from '../cards019k-critic-6cc8656e4f6c967868edac4bd71c87c57c6e7009/src/sim/live-battle.js';
import { createEditableGameSessionSetup } from '../cards019k-critic-6cc8656e4f6c967868edac4bd71c87c57c6e7009/src/content/editable-deck.js';
import { PLAYABLE_CARD_IDS } from '../cards019k-critic-6cc8656e4f6c967868edac4bd71c87c57c6e7009/src/content/playable-roster.js';
const canonical = (v) => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
const deck=['kilnkeeper','cinder-host',...PLAYABLE_CARD_IDS.filter(id=>id!=='kilnkeeper'&&id!=='cinder-host').slice(0,6)];
const setup=JSON.parse(createEditableGameSessionSetup(deck,2));
const battle=new LiveBattle(setup.battleSetup);
for (const command of [
  {cardId:'kilnkeeper',point:{x:3500,y:14500},sequence:0,side:'south',tick:0},
  {cardId:'cinder-host',point:{x:3500,y:21000},sequence:1,side:'north',tick:0},
]) assert.equal(battle.scheduleDeploy(canonical(command)).type,'deploy-scheduled');
let projectile;
for (let i=0;i<200 && !projectile;i++) {
  battle.step();
  projectile=battle.state.projectiles.find(p=>p.splashProfile!==undefined);
}
assert.ok(projectile,'ordinary splash projectile launched and remains pending');
const pendingBytes=battle.serialize();
assert.equal(pendingBytes,canonical(JSON.parse(pendingBytes)),'pending checkpoint is canonical');
const restored=LiveBattle.restore(pendingBytes);
const forked=battle.fork();
assert.equal(restored.serialize(),pendingBytes,'pending restore exact bytes');
assert.equal(forked.serialize(),pendingBytes,'pending fork exact bytes');
const pendingTick=battle.state.tick;
const ticks=projectile.impactTick-pendingTick+1;
const sourceEvents=battle.stepMany(ticks);
assert.deepEqual(restored.stepMany(ticks),sourceEvents,'pending restored events exact through impact');
assert.deepEqual(forked.stepMany(ticks),sourceEvents,'pending fork events exact through impact');
const damagedBytes=battle.serialize();
assert.equal(damagedBytes,canonical(JSON.parse(damagedBytes)),'damaged checkpoint is canonical');
assert.equal(restored.serialize(),damagedBytes,'pending restored bytes exact through impact');
assert.equal(forked.serialize(),damagedBytes,'pending fork bytes exact through impact');
const damagedA=LiveBattle.restore(damagedBytes);
const damagedB=LiveBattle.restore(damagedBytes);
const damagedFork=battle.fork();
assert.equal(damagedFork.serialize(),damagedBytes,'damaged fork exact bytes');
const eventsA=damagedA.stepMany(3);
assert.deepEqual(damagedB.stepMany(3),eventsA,'damaged restore branch events exact');
assert.deepEqual(damagedFork.stepMany(3),eventsA,'damaged fork branch events exact');
assert.equal(damagedA.serialize(),damagedB.serialize(),'damaged restore bytes converge');
assert.equal(damagedA.serialize(),damagedFork.serialize(),'damaged fork bytes converge');
assert.equal(canonical(damagedA.replay),canonical(damagedB.replay),'damaged restore replay exact');
assert.equal(canonical(damagedA.replay),canonical(damagedFork.replay),'damaged fork replay exact');
console.log(JSON.stringify({pendingTick,impactTick:projectile.impactTick,pendingCheckpointBytes:pendingBytes.length,pendingCheckpointCanonical:true,pendingRestoreForkExact:true,impactEvents:sourceEvents.filter(e=>e.projectileId===projectile.id||e.projectile?.id===projectile.id),damagedCheckpointBytes:damagedBytes.length,damagedCheckpointCanonical:true,damagedRestoreForkThreeTickEvents:eventsA.length,damagedRestoreForkExact:true},null,2));
