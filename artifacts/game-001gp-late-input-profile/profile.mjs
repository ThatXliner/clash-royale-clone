import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {chromium} from '/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs';
const server=spawn(process.execPath,['tests/game-browser-endurance-server.js']);
const address=await new Promise(r=>server.stdout.once('data',x=>r(JSON.parse(x))));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
let page;
try{
page=await browser.newPage();await page.goto(`http://127.0.0.1:${address.port}/tests/game-browser-endurance.html`);
await page.evaluate(async bytes=>{const {GameSession}=await import('/src/sim/game-session.js');const ui=await import('/src/ui/game-ui-projection.js');globalThis.s=GameSession.restore(bytes);globalThis.ui=ui;globalThis.projection=ui.mountGameUiProjection(Object.fromEntries(['combat','effects','feedback','hud'].map(k=>[k,document.body.appendChild(document.createElement('div'))])));},readFileSync(new URL('fixture.json',import.meta.url),'utf8'));
const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
const result=await page.evaluate(async()=>{const rows=[];for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,0));const a=performance.now();const frame=ui.createGameUiFrame(s);const b=performance.now();projection.project(frame);rows.push({create:b-a,project:performance.now()-b,total:performance.now()-a});}return rows;});
const {profile}=await cdp.send('Profiler.stop');writeFileSync(new URL(process.env.PROFILE_FAST ? 'cpu-fast.json' : 'cpu.json',import.meta.url),JSON.stringify(profile));writeFileSync(new URL(process.env.PROFILE_FAST ? 'result-fast.json' : 'result.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));assert.ok(result.every(row=>row.total<=50), "single15900 presentation exceeds50ms");
}finally{await page?.close();server.kill();await browser.close();}
