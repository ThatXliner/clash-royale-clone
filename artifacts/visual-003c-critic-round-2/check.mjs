import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {chromium} from '/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs';
const out=new URL('./',import.meta.url).pathname;
const server=spawn(process.execPath,['tests/game-browser-journey-server.js']);
const ready=await new Promise(resolve=>server.stdout.once('data',d=>resolve(JSON.parse(d))));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try{
const page=await browser.newPage({viewport:{width:720,height:1280}});
await page.goto(`http://${ready.host}:${ready.port}/public/ui-arena-shell.html?session-profile=live-seed-2-terminal`);
await page.evaluate(async()=>{const c=(await import('/src/ui/arena-shell-entry.js')).arenaHudController;c.enterManualStepMode();window.GS=(await import('/src/sim/game-session.js')).GameSession;window.setup=(await import('/src/ui/game-browser-entry.js')).createShippedGameSessionSetup(2,'live-seed-2-terminal');window.proj=await import('/src/ui/game-ui-projection.js');window.render=s=>{const layers=Object.fromEntries(['combat','effects','feedback','hud'].map(k=>[k,document.querySelector(`[data-game-browser-layer="${k}"]`)]));proj.mountGameUiProjection(layers).project(proj.createGameUiFrame(s));return ['combat','effects'].map(k=>layers[k].innerHTML).join('');};window.s=new GS(setup);});
const results=[];
for(const tick of [0,1,30,60,200,430,434,435,441,442,443,600,900,1200]){
results.push(await page.evaluate(t=>{s.stepMany(t-s.state.tick);render(s);return {tick:t,units:s.state.battle.units.map(u=>({id:u.id,hp:u.hitpoints,alive:u.alive,spawn:u.spawnedAt})),poses:[...document.querySelectorAll('[data-pose]')].map(n=>({id:n.dataset.combatId,pose:n.dataset.pose,reaction:n.dataset.reaction})),contacts:document.querySelectorAll('.combat-melee-contact').length,effects:document.querySelector('[data-game-browser-layer="effects"]').innerText};},tick));
await page.screenshot({path:`${out}tick-${tick}.png`});
}
const death=await page.evaluate(async()=>{const ss=new GS((await import('/src/ui/game-browser-entry.js')).createShippedGameSessionSetup(2));for(let t=0;t<5000;t++){const prev=ss.serialize();const before=ss.state.battle.units.filter(u=>u.alive);ss.stepMany(1);const dead=before.find(u=>!ss.state.battle.units.some(v=>v.id===u.id&&v.alive));if(dead){window.deathBefore=GS.restore(prev);window.deathAfter=ss;render(deathBefore);return {tick:ss.state.tick,id:dead.id,kind:dead.archetypeId,hpBefore:dead.hitpoints,after:ss.state.battle.units.find(u=>u.id===dead.id)};}}});
await page.screenshot({path:out+'death-before.png'});
const deathDom=await page.evaluate(()=>{render(deathAfter);return {marker:!!document.querySelector(`[data-combat-id="${deathBefore.state.battle.units.find(u=>u.alive&&!deathAfter.state.battle.units.some(v=>v.id===u.id&&v.alive)).id}"]`),effects:document.querySelector('[data-game-browser-layer="effects"]').innerHTML};});
await page.screenshot({path:out+'death-during.png'});
await page.evaluate(()=>{deathAfter.stepMany(5);render(deathAfter);});await page.screenshot({path:out+'death-after.png'});
writeFileSync(out+'death.json',JSON.stringify({death,deathDom},null,2));console.log(JSON.stringify({death,deathDom}));
const equivalence=await page.evaluate(()=>{const a=new GS(setup);a.stepMany(435);const direct=render(a);const restored=render(GS.restore(a.serialize()));const b=new GS(setup);[12,118,270,35].forEach(n=>b.stepMany(n));const chunk=render(b);const d=new GS(setup.replace('"thinkOffsetTicks":0','"thinkOffsetTicks":12'));d.stepMany(447);const delayed=render(d);return {restore:direct===restored,chunk:direct===chunk,delayedRestore:delayed===render(GS.restore(d.serialize()))};});
await page.screenshot({path:`${out}delayed-447.png`});
writeFileSync(out+'evidence.json',JSON.stringify({results,equivalence},null,2));console.log(JSON.stringify({results,equivalence}));
}finally{await browser.close();server.kill();}
