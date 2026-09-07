import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {chromium} from '/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs';
const out=new URL('./',import.meta.url).pathname;
const server=spawn(process.execPath,['tests/game-browser-journey-server.js']);
const ready=await new Promise(r=>server.stdout.once('data',d=>r(JSON.parse(String(d)))));
const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
try {
 const page=await browser.newPage({viewport:{width:720,height:1280}});
 await page.goto(`http://${ready.host}:${ready.port}/public/ui-arena-shell.html?session-profile=live-seed-2-terminal`);
 const results=await page.evaluate(async()=>{
  const c=(await import('/src/ui/arena-shell-entry.js')).arenaHudController;c.enterManualStepMode();
  const data=[];
  for(let i=0;i<1300;i++){
   const before=[...document.querySelectorAll('.combat-marker[data-kind]')].map(n=>n.dataset.entityKey??n.dataset.key);
   const events=c.stepMany(1);
   if(events.some(e=>/death|attack|deploy/.test(JSON.stringify(e))))data.push({tick:c.state.sessionTick,events,markers:document.querySelectorAll('.combat-marker[data-kind]').length,reactions:[...document.querySelectorAll('.combat-marker[data-kind]')].map(n=>n.dataset.reaction),impacts:document.querySelectorAll('.combat-effect-impact').length});
   if(data.length>0)break;
  }
  return data;
 });
 writeFileSync(out+'runtime.json',JSON.stringify(results,null,2));
 await page.screenshot({path:out+'runtime.png'});
 console.log(JSON.stringify(results).slice(0,16000));
}finally{await browser.close();server.kill();}
