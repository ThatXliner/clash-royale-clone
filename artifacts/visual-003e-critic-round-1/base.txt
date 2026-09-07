import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdirSync,writeFileSync } from 'node:fs';
const OUT=new URL('../artifacts/visual-003e-round-1/',import.meta.url).pathname;
const PLAYWRIGHT=process.env.GAME_BROWSER_PLAYWRIGHT ?? '/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs';
test('motion polish browser: real combat and canonical tower lifecycle, reduced motion and restart', {timeout:120000},async()=>{
  mkdirSync(OUT,{recursive:true});
  const server=spawn(process.execPath,[new URL('./game-browser-journey-server.js',import.meta.url).pathname],{stdio:['ignore','pipe','inherit']});
  let browser;
  try {
    const ready=await new Promise((resolve,reject)=>{let data='';server.stdout.on('data',chunk=>{data+=chunk;if(data.includes('\n'))resolve(JSON.parse(data.split('\n')[0]));});server.on('error',reject);});
    const {chromium}=await import(PLAYWRIGHT);
    browser=await chromium.launch({executablePath:process.env.GAME_BROWSER_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
    const page=await browser.newPage({viewport:{width:720,height:1280},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',error=>errors.push(String(error)));
    await page.goto(`http://${ready.host}:${ready.port}/public/ui-arena-shell.html?session-profile=live-seed-2-terminal`);
    await page.waitForSelector('[data-ui="arena"]');
    await page.evaluate(async()=>{globalThis.motionController=(await import('/src/ui/arena-shell-entry.js')).arenaHudController;motionController.enterManualStepMode();const {GameSession}=await import('/src/sim/game-session.js');const {createShippedGameSessionSetup}=await import('/src/ui/game-browser-entry.js');const fresh=new GameSession(createShippedGameSessionSetup(2,'live-seed-2-terminal'));motionController.restore(JSON.stringify({bridge:JSON.stringify({deliveries:[],version:1}),running:false,session:fresh.serialize(),version:1}));motionController.enterManualStepMode();});
    const evidence=[];
    for(const tick of [0,12,24,435,438]) {
      evidence.push(await page.evaluate(tick=>{if(tick>motionController.state.sessionTick)motionController.stepMany(tick-motionController.state.sessionTick);const bytes=()=>[...document.querySelectorAll('[data-game-browser-layer]')].map(n=>n.innerHTML).join('');const before=bytes();motionController.restore(motionController.serialize());motionController.enterManualStepMode();return {tick,restored:before===bytes(),poses:[...document.querySelectorAll('[data-pose]')].map(n=>n.dataset.pose)};},tick));
      await page.screenshot({path:`${OUT}session-${tick}.png`});
    }
    assert.ok(evidence.every(e=>e.restored));assert.ok(evidence.at(-1).poses.includes('recoil'));
    await page.locator('[data-ui="card-slot"]').first().click();
    await page.mouse.click(195,750);
    await page.evaluate(()=>motionController.stepMany(1));
    const arrival=await page.locator('.game-ui-hud-frame').evaluate(n=>({slot:n.dataset.arrivalSlot,offset:n.style.getPropertyValue('--arrival-offset')}));
    assert.equal(arrival.slot,'0');assert.notEqual(arrival.offset,'0px');
    evidence.push({localCardArrival:arrival});
    await page.screenshot({path:`${OUT}card-arrival.png`});
    await page.evaluate(()=>motionController.stepMany(18));
    await page.screenshot({path:`${OUT}card-settled.png`});
    // Standalone canonical MatchClock fixture isolates tower lifecycle without
    // changing a GameSession, fabricating a view or waiting for a long match.
    await page.evaluate(async()=>{
      const {MatchClock}=await import('/src/sim/match.js');
      const {MatchFeedbackProjector,bindMatchFeedback}=await import('/src/ui/match-feedback.js');
      const ids=['north:central','north:lane:left','north:lane:right','south:central','south:lane:left','south:lane:right'];
      const towers=ids.map(id=>({id,hitpoints:id.endsWith('central')?4824:3052}));
      globalThis.motionMatch=new MatchClock({initialTowers:towers});motionMatch.scheduleTowerEvidence(10,{towers:towers.map(t=>({...t,hitpoints:t.id==='north:lane:left'?0:t.hitpoints})),destroyedTowerIds:['north:lane:left']});
      globalThis.renderTower=tick=>{motionMatch.runToTick(tick);const p=new MatchFeedbackProjector();bindMatchFeedback(document.querySelector('[data-game-browser-layer="feedback"]'),p.project(motionMatch.state,motionMatch.eventLog,{replayBytes:motionMatch.replayBytes(),snapshot:motionMatch.serialize()}));};
    });
    for(const tick of [11,22,70]) {
      const tower=await page.evaluate(tick=>{renderTower(tick);const n=document.querySelector('.match-feedback__destruction');return {tick,stage:n.dataset.stage,originalVisibility:getComputedStyle(document.querySelector('.tower-pad--north-west')).visibility,bounds:n.getBoundingClientRect().toJSON()};},tick);
      evidence.push(tower);assert.equal(tower.originalVisibility,'hidden');
      await page.screenshot({path:`${OUT}tower-${tick}.png`});
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    const reduced=await page.evaluate(()=>getComputedStyle(document.querySelector('.match-feedback__destruction b')).transform);
    assert.equal(reduced,'none');await page.screenshot({path:`${OUT}reduced-motion.png`});
    await page.emulateMedia({reducedMotion:'no-preference'});
    const terminal=await page.evaluate(()=>{for(let i=0;i<40&&!motionController.state.terminal;i++)motionController.fastForwardSegment(600);return motionController.state.terminal;});
    assert.equal(terminal,true);
    await page.screenshot({path:`${OUT}terminal.png`});
    await page.evaluate(()=>{motionController.restart();motionController.enterManualStepMode();});
    assert.equal(await page.locator('.match-feedback__destruction').count(),0);
    assert.equal(await page.locator('.tower-pad--north-west').evaluate(n=>getComputedStyle(n).visibility),'visible');
    await page.screenshot({path:`${OUT}restart.png`});
    assert.deepEqual(errors,[]);writeFileSync(`${OUT}timeline.json`,JSON.stringify({evidence,reduced,errors},null,2));
  } finally {await browser?.close();server.kill('SIGTERM');}
});
