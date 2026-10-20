import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
const OUT = new URL('../artifacts/visual-003e-round-2/', import.meta.url).pathname;
const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ?? '/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs';
test('terminal motion browser: real RAF tail, exact manual ages and restore without simulation advancement', { timeout: 120000 }, async () => {
  mkdirSync(OUT, { recursive: true });
  const server = spawn(process.execPath, [new URL('./game-browser-journey-server.js', import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'inherit'] });
  let browser;
  try {
    const ready = await new Promise((resolve, reject) => { let data = ''; server.stdout.on('data', chunk => { data += chunk; if(data.includes('\n')) resolve(JSON.parse(data.split('\n')[0])); }); server.on('error', reject); });
    const { chromium } = await import(PLAYWRIGHT);
    browser = await chromium.launch({ executablePath: process.env.GAME_BROWSER_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`http://${ready.host}:${ready.port}/public/ui-arena-shell.html?session-profile=live-seed-2-terminal`);
    await page.waitForSelector('[data-ui="arena"]');
    const terminalTick = await page.evaluate(async () => {
      const { arenaHudController } = await import('/src/ui/arena-shell-entry.js');
      const { GameSession } = await import('/src/sim/game-session.js');
      const { createShippedGameSessionSetup } = await import('/src/ui/game-browser-entry.js');
      globalThis.tailController = arenaHudController; tailController.enterManualStepMode();
      const setup = createShippedGameSessionSetup(2, 'live-seed-2-terminal');
      const terminal = new GameSession(setup);
      while (!terminal.state.terminal) terminal.stepMany(600);
      const before = new GameSession(setup); before.stepMany(terminal.state.tick - 6);
      tailController.restore(JSON.stringify({ bridge: JSON.stringify({deliveries:[],version:1}), running:false, session:before.serialize(),version:1 }));
      globalThis.tailSamples = [];
      globalThis.tailObserver = new MutationObserver(() => {
        const panel = document.querySelector('.match-feedback__overlay');
        if (panel) tailSamples.push({ age:Number(panel.dataset.presentationTick), tick:tailController.state.sessionTick,
          transform:getComputedStyle(panel).transform, opacity:getComputedStyle(panel).opacity });
      });
      tailObserver.observe(document.querySelector('[data-game-browser-layer="feedback"]'), {childList:true,subtree:true});
      const step = GameSession.prototype.stepMany;
      globalThis.terminalStepCalls = 0;
      GameSession.prototype.stepMany = function(count) { if(this.state.terminal) terminalStepCalls += 1; return step.call(this,count); };
      tailController.start();
      return terminal.state.tick;
    });
    await page.waitForFunction(() => tailController.state.terminalPresentationTick === 24 && !tailController.state.scheduled);
    const automatic = await page.evaluate(() => { tailObserver.disconnect(); return {samples:tailSamples, terminalStepCalls, state:tailController.state}; });
    assert.equal(automatic.terminalStepCalls, 0);
    assert.ok(automatic.samples.some(s => s.age === 0));
    assert.ok(automatic.samples.some(s => s.age > 0 && s.age < 24));
    assert.ok(automatic.samples.every(s => s.tick === terminalTick));
    assert.notEqual(automatic.samples[0].transform, automatic.samples.at(-1).transform);
    await page.evaluate(() => {
      const snapshot = JSON.parse(tailController.serialize()); snapshot.terminalPresentation = {running:false,tick:0};
      const canonical = value => Array.isArray(value) ? `[${value.map(canonical)}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}` : JSON.stringify(value);
      tailController.restore(canonical(snapshot));
      globalThis.tailSimulationBytes = tailController.session.serialize();
    });
    const manual = [];
    let reduced;
    for (const age of [0,6,12,24]) {
      manual.push(await page.evaluate(age => {
        tailController.advanceTerminalPresentation(age-tailController.state.terminalPresentationTick);
        const layer = () => document.querySelector('[data-game-browser-layer="feedback"]');
        const before = layer().innerHTML, snapshot = tailController.serialize(); tailController.restore(snapshot);
        const panel = layer().querySelector('.match-feedback__overlay');
        return {age, restored:before===layer().innerHTML, stableSession:tailSimulationBytes===tailController.session.serialize(), transform:getComputedStyle(panel).transform, opacity:getComputedStyle(panel).opacity};
      }, age));
      await page.screenshot({path:`${OUT}terminal-age-${age}.png`});
      if (age === 0) {
        await page.emulateMedia({reducedMotion:'reduce'});
        reduced = await page.evaluate(() => {
          const panel = document.querySelector('.match-feedback__overlay'); return {transform:getComputedStyle(panel).transform,opacity:getComputedStyle(panel).opacity};
        });
        assert.deepEqual(reduced,{transform:'none',opacity:'1'});
        await page.screenshot({path:`${OUT}terminal-reduced-motion.png`});
        await page.emulateMedia({reducedMotion:'no-preference'});
      }
    }
    assert.ok(manual.every(s => s.restored && s.stableSession));
    assert.equal(new Set(manual.map(s=>s.transform)).size,4);
    await page.evaluate(() => {tailController.restart();tailController.enterManualStepMode();});
    assert.equal(await page.evaluate(()=>tailController.state.terminalPresentationTick),0);
    assert.equal(await page.locator('.match-feedback__overlay').count(),0);
    await page.screenshot({path:`${OUT}terminal-restart.png`});
    assert.deepEqual(errors,[]);
    writeFileSync(`${OUT}terminal-timeline.json`,JSON.stringify({terminalTick,automatic,manual,reduced,errors},null,2));
  } finally {await browser?.close();server.kill('SIGTERM');}
});
