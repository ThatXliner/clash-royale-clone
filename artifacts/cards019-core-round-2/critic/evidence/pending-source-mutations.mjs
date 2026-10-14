import assert from 'node:assert/strict';
import { LiveBattle } from '../cards019k-critic-6cc8656e4f6c967868edac4bd71c87c57c6e7009/src/sim/live-battle.js';
import { createEditableGameSessionSetup } from '../cards019k-critic-6cc8656e4f6c967868edac4bd71c87c57c6e7009/src/content/editable-deck.js';
import { PLAYABLE_CARD_IDS } from '../cards019k-critic-6cc8656e4f6c967868edac4bd71c87c57c6e7009/src/content/playable-roster.js';
const canonical = (v) => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
const deck=['kilnkeeper','cinder-host',...PLAYABLE_CARD_IDS.filter(id=>id!=='kilnkeeper'&&id!=='cinder-host').slice(0,6)];
const setup=JSON.parse(createEditableGameSessionSetup(deck,2));
const battle=new LiveBattle(setup.battleSetup);
battle.scheduleDeploy(canonical({cardId:'cinder-host',point:{x:3500,y:21000},sequence:0,side:'north',tick:0}));
battle.scheduleDeploy(canonical({cardId:'kilnkeeper',point:{x:3500,y:14500},sequence:1,side:'south',tick:0}));
let projectile;
for(let i=0;i<200&&!projectile;i++){battle.step();projectile=battle.state.projectiles.find(p=>p.splashProfile!==undefined);}
assert.ok(projectile,'actual source-bound pending projectile exists');
const pending=battle.serialize();
const mutations=[
 ['wrong card identity',s=>{s.setup.roster.find(c=>c.id==='kilnkeeper').id='brassbolt';}],
 ['wrong primary component/archetype',s=>{entity(s).archetypeId='brassbolt';}],
 ['wrong delivery card binding',s=>{entity(s).deliveryPolicy.cardId='brassbolt';}],
 ['wrong splash card binding',s=>{entity(s).projectileSplashPolicy.cardId='brassbolt';}],
 ['wrong source export',s=>{entity(s).projectileSplashPolicy.sourceExport='forged-catalog';}],
 ['wrong radius',s=>{entity(s).projectileSplashPolicy.radiusMillitiles=1499;}],
 ['wrong ordinary damage',s=>{entity(s).damage+=1;}],
 ['wrong raw damage',s=>{entity(s).projectileSplashSourceFacts.projectileDamage=282;}],
 ['wrong raw index',s=>{entity(s).projectileSplashSourceFacts.projectileDamagePerLevelIndex=7;}],
 ['wrong linked projectile ID',s=>{entity(s).projectileSplashSourceFacts.projectileDamageLinkedProjectileId='otherProjectile';}],
 ['wrong source URI',s=>{entity(s).projectileSplashSourceFacts.projectileDamageSourceUri='https://example.invalid/forged.json';}],
 ['wrong source SHA-256',s=>{entity(s).projectileSplashSourceFacts.projectileDamageSourceFileSha256='0'.repeat(64);}],
 ['wrong pinned commit',s=>{entity(s).projectileSplashSourceFacts.projectileDamageSourceCommit='0'.repeat(40);}],
 ['wrong component order witness',s=>{s.setup.roster.find(c=>c.id==='kilnkeeper').formation.componentOrder[0]='brassbolt';}],
 ['wrong raw damage QUESTION',s=>{s.setup.questions.find(q=>q.key==='kilnkeeper.damage').value=282;}],
 ['wrong splash radius QUESTION',s=>{s.setup.questions.find(q=>q.key==='kilnkeeper.projectile-splash-radius-millitiles').value=1499;}],
 ['wrong homing QUESTION',s=>{s.setup.questions.find(q=>q.key==='kilnkeeper.projectile-homing').value=0;}],
 ['wrong sourceConfidence witness',s=>{entity(s).sourceConfidencePolicy.fields.find(f=>f.field==='damage').source='forged-source';}],
];
function entity(snapshot){return snapshot.setup.roster.find(c=>c.id==='kilnkeeper').entities[0];}
const rejected=[];
for(const [label,mutate] of mutations){const forged=JSON.parse(pending);mutate(forged);let threw=false;try{LiveBattle.restore(canonical(forged));}catch{threw=true;}assert.equal(threw,true,`${label} rejected by actual pending restore`);rejected.push(label);}
console.log(JSON.stringify({pendingTick:battle.state.tick,impactTick:projectile.impactTick,pendingBytes:pending.length,mutationCount:rejected.length,rejected},null,2));
