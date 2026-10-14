const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright');
const outDir = __dirname;
const baselineAsset = path.join(outDir, 'round1-revealed.webp');
const htmlPath = path.join(outDir, 'round1-native-board.html');
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden}body{background:#60734d}
#board{position:fixed;inset:0;background-color:#60734d;background-image:linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(rgba(15,28,18,.045) 1px,transparent 1px);background-size:32px 32px}
#sprite{position:absolute;left:100px;top:100px;width:13px;height:13px;display:block;object-fit:fill;image-rendering:auto}</style>
<main id="board"><img id="sprite" src="${pathToFileURL(baselineAsset).href}" alt=""></main>`;
(async () => {
  fs.writeFileSync(htmlPath, html);
  const browser = await chromium.launch({ headless: true });
  const report = { browser: `Playwright Chromium ${browser.version()}`, deviceScaleFactor: 1, viewports: [] };
  try {
    for (const [label,width,height] of [['phone',390,844],['desktop',1440,933]]) {
      const page = await browser.newPage({ viewport:{width,height}, deviceScaleFactor:1 });
      await page.goto(pathToFileURL(htmlPath).href, {waitUntil:'load'});
      await page.locator('#sprite').evaluate((image)=>image.decode());
      const metrics = await page.evaluate(()=>{
        const image=document.querySelector('#sprite'), r=image.getBoundingClientRect();
        return {dpr:devicePixelRatio,viewport:[innerWidth,innerHeight],natural:[image.naturalWidth,image.naturalHeight],css:[r.width,r.height],xy:[r.x,r.y]};
      });
      const board=path.join(outDir,`round1-${label}-native-board.png`);
      const crop=path.join(outDir,`round1-${label}-sprite-css13px-dpr1.png`);
      await page.screenshot({path:board,fullPage:true});
      await page.evaluate(()=>{document.documentElement.style.background="transparent";document.body.style.background="transparent";document.querySelector("#board").style.background="transparent";document.querySelector("#board").style.backgroundImage="none";});
      await page.locator('#sprite').screenshot({path:crop,omitBackground:true});
      report.viewports.push({label,...metrics,board:path.basename(board),crop:path.basename(crop)});
      await page.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(path.join(outDir,'round1-native-board-capture.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
})().catch((error)=>{console.error(error);process.exitCode=1;});
