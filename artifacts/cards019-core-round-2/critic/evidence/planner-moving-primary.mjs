import assert from 'node:assert/strict';
import { getOrdinaryProjectileSplashProfile } from '../cards019k-critic-6cc8656e4f6c967868edac4bd71c87c57c6e7009/src/shared/ordinary-projectile-delivery-authority.js';
import { planOrdinaryProjectileSplashImpact } from '../cards019k-critic-6cc8656e4f6c967868edac4bd71c87c57c6e7009/src/sim/ordinary-projectile-splash.js';
const profile=getOrdinaryProjectileSplashProfile('kilnkeeper','kilnkeeper');
const center={x:10000,y:10000};
function run(primaryLayer,sign) {
  const point=(dx,dy=0)=>({x:center.x+dx,y:center.y+dy});
  const primary={alive:true,id:2,layer:primaryLayer,position:point(1501*sign),radius:0,side:'north',targetable:true};
  const units=[primary,
    {alive:true,id:3,layer:'air',position:point(1500),radius:0,side:'north',targetable:true},
    {alive:true,id:4,layer:'ground',position:point(-1500),radius:0,side:'north',targetable:true},
    {alive:true,id:5,layer:'ground',position:point(1501),radius:0,side:'north',targetable:true},
    {alive:false,id:6,layer:'ground',position:center,radius:0,side:'north',targetable:true},
    {alive:true,id:7,layer:'air',position:center,radius:0,side:'south',targetable:true},
    {alive:true,id:8,layer:'ground',position:center,radius:0,side:'north',targetable:false},
  ];
  const structures=[
    {alive:true,id:9,layer:'ground',position:point(0,1500),radius:0,side:'north',structureId:'north:building:9',targetable:true},
    {alive:true,id:10,layer:'ground',position:point(0,1501),radius:0,side:'north',structureId:'north:building:10',targetable:true},
  ];
  const plan=planOrdinaryProjectileSplashImpact({attackerId:20,attackSequence:1,center,damage:281,enemySide:'north',primaryKind:'unit',primaryStatus:'contact',primaryTarget:primary,primaryTargetId:2,primaryTargetable:true,profile,projectileId:4,structures,tick:124,units});
  assert.equal(plan.impactStatus,'target_missing');
  assert.deepEqual(plan.unitHits.map(({targetId,amount})=>({targetId,amount})),[{targetId:3,amount:281},{targetId:4,amount:281}]);
  assert.deepEqual(plan.structureContacts.map(({structureId,damage})=>({structureId,damage})),[{structureId:'north:building:9',damage:281}]);
  assert.equal(plan.unitHits.some(({targetId})=>targetId===2),false,'moved primary outside the circle gets no direct damage');
  return {primaryLayer,primary:primary.position,impactStatus:plan.impactStatus,unitHits:plan.unitHits,structureContacts:plan.structureContacts.map(({structureId,damage})=>({structureId,damage})),excludedIds:[2,5,6,7,8,10]};
}
console.log(JSON.stringify({radiusMillitiles:profile.radiusMillitiles,groundPrimary:run('ground',1),airPrimary:run('air',-1)},null,2));
