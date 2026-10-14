import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const ROOT = "/private/tmp/frame-layer-ablation-898";
const OUTPUT = "/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/frame-restore-round-1/builder/faithful-ablation";
const CHROME = process.env.GAME_BROWSER_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DECK = ["skymaul", "brassbolt", "reedsting", "briar-band", "cinderlings", "coilblade", "mossguard", "copperskiff"];
const EXPECTED = { slot: { x: 0, y: 117, width: 390, height: 659 }, frame: { x: 9.65625, y: 117, width: 370.6875, height: 659 } };
const MIME = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };
mkdirSync(OUTPUT, { recursive: true });
writeFileSync(resolve(OUTPUT, "runner-pid.txt"), `${process.pid}\n`);
const startedAt = new Date().toISOString();

async function startStaticServer() {
  const missingPaths = [];
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
    if (pathname === "/favicon.ico") return response.writeHead(204).end();
    const file = resolve(ROOT, `.${pathname}`);
    if (file !== ROOT && !file.startsWith(`${ROOT}${sep}`)) return response.writeHead(403).end();
    try {
      const bytes = await readFile(file);
      response.writeHead(200, { "Cache-Control": "no-store", "Content-Length": bytes.length, "Content-Type": MIME[extname(file)] ?? "application/octet-stream", "X-Content-Type-Options": "nosniff" }).end(bytes);
    } catch {
      missingPaths.push(pathname);
      response.writeHead(404).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { server, missingPaths, url: `http://127.0.0.1:${server.address().port}` };
}

async function waitForPaintFrames(page, child) {
  const next = () => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
  await Promise.all([page.evaluate(next), child.evaluate(next)]);
  await page.evaluate(next);
}

async function layout(page, phase) {
  return page.evaluate((phaseName) => {
    const get = (s) => document.querySelector(s);
    const nodes = { shell: get(".app-shell"), header: get(".app-header"), main: get(".app-main"), view: get("#view-battle"), heading: get(".battle-heading"), slot: get("[data-battle-frame-slot]"), frame: get("[data-battle-frame-slot] iframe"), nav: get(".app-nav") };
    const describe = (n) => {
      if (!n) return null;
      const r = n.getBoundingClientRect(), c = getComputedStyle(n);
      return { rect: { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, right: r.right, bottom: r.bottom, left: r.left }, style: { display: c.display, position: c.position, boxSizing: c.boxSizing, paddingTop: c.paddingTop, paddingRight: c.paddingRight, paddingBottom: c.paddingBottom, paddingLeft: c.paddingLeft, height: c.height, minHeight: c.minHeight, flex: c.flex, transitionProperty: c.transitionProperty, transitionDuration: c.transitionDuration, animationName: c.animationName, animationDuration: c.animationDuration, transform: c.transform } };
    };
    return { phase: phaseName, time: performance.now(), viewport: { innerWidth, innerHeight, dpr: devicePixelRatio, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches }, route: { active: nodes.shell?.dataset.viewActive ?? null }, nodes: Object.fromEntries(Object.entries(nodes).map(([k, n]) => [k, describe(n)])) };
  }, phase);
}

async function snapshot(page, child, label, attack, restoreCount) {
  const outer = await layout(page, `${label}:outer`);
  const inner = await child.evaluate(({ label: phase, attackMeta, restores }) => {
    const c = globalThis.__spriteRendererProbe;
    const state = c.session.state;
    const sourceId = attackMeta?.attack?.attackerId;
    const source = state.battle.units.find((u) => u.id === sourceId) ?? null;
    const card = document.querySelector('[data-ui="card-slot"][data-card-id="brassbolt"]');
    const cardStyle = card ? getComputedStyle(card) : null;
    const cardRect = card?.getBoundingClientRect();
    const audio = document.querySelector('[data-ui="audio-toggle"]');
    const current = [...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')].map((m) => {
      const art = m.querySelector('.combat-art'), r = m.getBoundingClientRect();
      return { id: Number(m.dataset.combatId), side: m.classList.contains('combat-marker--north') ? 'north' : 'south', rect: { x: r.x, y: r.y, width: r.width, height: r.height }, action: art?.dataset.spriteAction ?? null, age: art?.dataset.attackAnimationAge ?? null, frame: art?.dataset.spriteFrame ?? null, direction: art?.dataset.spriteDirection ?? null, tick: art?.dataset.simulationTick ?? null, reducedMotion: art?.dataset.reducedMotion ?? null, sourceId: art?.dataset.attackSourceId ?? null, sourceSequence: art?.dataset.attackSourceSequence ?? null, sourceTick: art?.dataset.attackSourceTick ?? null };
    });
    const controls = [...document.querySelectorAll('input,select,textarea,button')].map((n) => ({ tag: n.tagName, ui: n.dataset.ui ?? null, value: 'value' in n ? n.value : null, checked: 'checked' in n ? n.checked : null, pressed: n.getAttribute('aria-pressed'), text: n.textContent?.trim() ?? '', disabled: n.disabled, focus: n === document.activeElement, hover: n.matches(':hover') }));
    const cardDescribe = card ? { rect: { x: cardRect.x, y: cardRect.y, width: cardRect.width, height: cardRect.height }, transform: cardStyle.transform, willChange: cardStyle.willChange, transitionDuration: cardStyle.transitionDuration, transitionProperty: cardStyle.transitionProperty, matchesFocus: card.matches(':focus'), matchesFocusVisible: card.matches(':focus-visible'), matchesHover: card.matches(':hover'), html: card.outerHTML, parent: (() => { const p = card.parentElement, r = p.getBoundingClientRect(), s = getComputedStyle(p); return { className: p.className, rect: { x:r.x,y:r.y,width:r.width,height:r.height }, transform:s.transform, willChange:s.willChange, boxShadow:s.boxShadow }; })() } : null;
    return { phase, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, sessionTick: c.state.sessionTick, serializedSha256: null, controllerState: c.state, source: source ? { id: source.id, alive: source.alive, hp: source.hitpoints, side: source.side, archetypeId: source.archetypeId, attack: source.attack } : null, sourceEvent: attackMeta, activeElement: document.activeElement ? { tag: document.activeElement.tagName, id: document.activeElement.id, className: typeof document.activeElement.className === 'string' ? document.activeElement.className : null } : null, card: cardDescribe, audio: audio ? { text: audio.textContent.trim(), pressed: audio.getAttribute('aria-pressed'), label: audio.getAttribute('aria-label'), html: audio.outerHTML } : null, controls, sprites: current, bodyText: document.body.innerText, fonts: document.fonts.status, activeAnimations: document.getAnimations({ subtree: true }).map((a) => ({ playState: a.playState, currentTime: a.currentTime, target: a.effect?.target?.className ?? a.effect?.target?.tagName ?? null })), restoreCount: restores };
  }, { label, attackMeta: attack, restores: restoreCount });
  const serialized = await child.evaluate(() => globalThis.__spriteRendererProbe.serialize());
  inner.serializedSha256 = createHash("sha256").update(serialized).digest("hex");
  return { outer, inner };
}

async function stableViewportScreenshot(page, child, label, attack, restoreCount, timeline) {
  await Promise.all([page.evaluate(() => document.fonts.ready), child.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined))); })]);
  let previous = null;
  for (let captures = 1; captures <= 8; captures += 1) {
    await waitForPaintFrames(page, child);
    const beforeShot = await snapshot(page, child, `${label}:outer-capture-${captures}`, attack, restoreCount);
    timeline.push({ kind: "pre-outer-capture-state", capture: label, index: captures, state: beforeShot });
    const screenshot = await page.screenshot();
    writeFileSync(resolve(OUTPUT, `${label}-outer-capture-${captures}.png`), screenshot);
    if (previous !== null && screenshot.equals(previous)) return { captures, screenshot, stable: true };
    previous = screenshot;
  }
  return { captures: 8, screenshot: previous, stable: false };
}

async function decodeDiff(page, before, after) {
  return page.evaluate(async ({ a, b }) => {
    const decode = async (base64) => { const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; const c = canvas.getContext('2d', { willReadFrequently: true }); c.drawImage(image, 0, 0); return { width: canvas.width, height: canvas.height, p: c.getImageData(0, 0, canvas.width, canvas.height).data }; };
    const x = await decode(a), y = await decode(b); let count=0, max=0, minX=Infinity,minY=Infinity,maxX=-1,maxY=-1; const first=[];
    for (let i=0;i<x.p.length;i+=4) { let d=0; for(let c=0;c<4;c++) d=Math.max(d,Math.abs(x.p[i+c]-y.p[i+c])); if(!d) continue; const n=i/4, px=n%x.width, py=Math.floor(n/x.width); count++; max=Math.max(max,d); minX=Math.min(minX,px); minY=Math.min(minY,py); maxX=Math.max(maxX,px); maxY=Math.max(maxY,py); if(first.length<32) first.push({x:px,y:py,before:[...x.p.slice(i,i+4)],after:[...y.p.slice(i,i+4)],maxChannelDelta:d}); }
    return { dimensionsA:[x.width,x.height], dimensionsB:[y.width,y.height], differingPixelCount:count, maximumChannelDelta:max, boundingBox:count?{minX,minY,maxX,maxY}:null, firstDifferingPixels:first };
  }, { a: before.toString('base64'), b: after.toString('base64') });
}

async function pointFingerprint(page, child, point) {
  const frame = await page.locator('[data-battle-frame-slot] iframe').boundingBox();
  const childPoint = { x: (point.x-frame.x)*(720/frame.width), y: (point.y-frame.y)*(1280/frame.height) };
  const [outer, inner] = await Promise.all([
    page.evaluate(({x,y}) => { const n=document.elementFromPoint(x,y); const chain=[]; for(let p=n;p&&chain.length<6;p=p.parentElement){const r=p.getBoundingClientRect(),s=getComputedStyle(p);chain.push({tag:p.tagName,className:typeof p.className==='string'?p.className:null,ui:p.dataset?.ui??null,rect:{x:r.x,y:r.y,width:r.width,height:r.height},transform:s.transform,willChange:s.willChange,transitionDuration:s.transitionDuration,boxShadow:s.boxShadow,borderColor:s.borderColor});}return chain; }, point),
    child.evaluate(({x,y}) => {const nodes=document.elementsFromPoint(x,y);return nodes.slice(0,6).map(p=>{const r=p.getBoundingClientRect(),s=getComputedStyle(p);return {tag:p.tagName,className:typeof p.className==='string'?p.className:null,ui:p.dataset?.ui??null,cardId:p.dataset?.cardId??null,rect:{x:r.x,y:r.y,width:r.width,height:r.height},transform:s.transform,willChange:s.willChange,transitionDuration:s.transitionDuration,boxShadow:s.boxShadow,borderColor:s.borderColor};});}, childPoint),
  ]);
  return { point, frame, childPoint, outerChain: outer, childChain: inner };
}

async function sampleTeamPixels(page, screenshot, markers) {
  return page.evaluate(async ({base64,crops}) => { const img=new Image();img.src=`data:image/png;base64,${base64}`;await img.decode();const cv=document.createElement('canvas');cv.width=img.naturalWidth;cv.height=img.naturalHeight;const c=cv.getContext('2d',{willReadFrequently:true});c.drawImage(img,0,0);return crops.map((crop)=>{const l=Math.max(0,Math.floor(crop.x)),t=Math.max(0,Math.floor(crop.y)),r=Math.min(cv.width,Math.ceil(crop.x+crop.width)),b=Math.min(cv.height,Math.ceil(crop.y+crop.height)),p=c.getImageData(l,t,r-l,b-t).data,ch=crop.color.match(/[0-9A-F]{2}/giu).map(v=>parseInt(v,16));let count=0;for(let i=0;i<p.length;i+=4)if(p[i+3]>=210&&Math.abs(p[i]-ch[0])<=24&&Math.abs(p[i+1]-ch[1])<=24&&Math.abs(p[i+2]-ch[2])<=24)count++;return{actorId:crop.actorId,side:crop.side,teamColor:crop.color,visibleTeamColorPixels:count,crop:{x:l,y:t,width:r-l,height:b-t}};}); }, {base64:screenshot.toString('base64'),crops:markers});
}

async function main() {
  const repoCommit = execFileSync('git',['-C',ROOT,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  assert.equal(repoCommit,'8983794bdba940cc8232bdfe1d6181a823776916');
  const {server,missingPaths,url} = await startStaticServer(); let browser;
  const pageErrors=[],consoleErrors=[],timeline=[],shots={}, restoreLog=[]; let restoreCount=0, actualAttack=null;
  try {
    browser=await chromium.launch({executablePath:existsSync(CHROME)?CHROME:undefined,headless:true});
    const page=await browser.newPage({deviceScaleFactor:1,viewport:{width:390,height:844}});
    page.on('pageerror',e=>pageErrors.push(String(e))); page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text());});
    let cdp=null, latestLayerTree=null;
    const cdpContexts=new Map();
    const cdpSetup={available:false,error:null};
    try {
      cdp=await page.context().newCDPSession(page);
      cdp.on('Runtime.executionContextCreated',({context})=>{if(context.auxData?.isDefault&&context.auxData?.frameId)cdpContexts.set(context.auxData.frameId,context.id);});
      cdp.on('LayerTree.layerTreeDidChange',({layers})=>{latestLayerTree=layers??[];});
      await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('DOM.enable'); await cdp.send('LayerTree.enable');
      cdpSetup.available=true;
    } catch(error) { cdpSetup.error=String(error); }
    const inspectCardLayer=async(phase)=>{
      if(!cdpSetup.available)return {phase,available:false,reason:cdpSetup.error??'CDP session unavailable'};
      try {
        const tree=(await cdp.send('Page.getFrameTree')).frameTree;
        const find=(node)=>{if(node.frame?.url?.includes('app-frame=1'))return node.frame.id;for(const child of node.childFrames??[]){const found=find(child);if(found)return found;}return null;};
        const frameId=find(tree),contextId=frameId?cdpContexts.get(frameId):null;
        if(!frameId||!contextId)return {phase,available:false,reason:'child frame default execution context not exposed',frameId,layerTreeCount:latestLayerTree?.length??null};
        const remote=await cdp.send('Runtime.evaluate',{expression:"document.querySelector('[data-ui=\"card-slot\"][data-card-id=\"brassbolt\"]')",contextId,returnByValue:false});
        const objectId=remote.result?.objectId;
        if(!objectId)return {phase,available:false,reason:'card slot query returned no remote node',exception:remote.exceptionDetails?.text??null,frameId};
        const requested=await cdp.send('DOM.requestNode',{objectId});
        const described=await cdp.send('DOM.describeNode',{nodeId:requested.nodeId,depth:0});
        const backendNodeId=described.node?.backendNodeId??null;
        const matches=(latestLayerTree??[]).filter(layer=>layer.backendNodeId===backendNodeId);
        const layers=[];
        for(const layer of matches){let reasons=null,reasonError=null;try{reasons=await cdp.send('LayerTree.compositingReasons',{layerId:layer.layerId});}catch(error){reasonError=String(error);}layers.push({layerId:layer.layerId,backendNodeId:layer.backendNodeId,width:layer.width,height:layer.height,offsetX:layer.offsetX,offsetY:layer.offsetY,transform:layer.transform??null,drawsContent:layer.drawsContent??null,compositingReasons:reasons?.compositingReasons??null,reasonError});}
        return {phase,available:true,frameId,contextId,nodeId:requested.nodeId,backendNodeId,layerTreeCount:latestLayerTree?.length??0,matchingLayers:layers};
      } catch(error) { return {phase,available:false,reason:String(error),layerTreeCount:latestLayerTree?.length??null}; }
    };
    const response=await page.goto(`${url}/public/index.html`,{waitUntil:'networkidle'}); assert.equal(response.status(),200);
    await page.locator('.app-nav [data-nav-to="battle"]').click();
    const frameElement=page.locator('[data-battle-frame-slot] iframe'); await frameElement.waitFor({state:'attached'});
    const frame=frameElement.contentFrame(); await frame.locator('[data-ui="arena"]').waitFor({state:'visible',timeout:8000});
    const child=page.frames().find(f=>f.url().includes('app-frame=1')); assert.ok(child);
    const boot=await child.evaluate(async(deck)=>{const {arenaHudController:c}=await import('/src/ui/arena-shell-entry.js');globalThis.__spriteRendererProbe=c;const wasRunning=!c.state.paused;if(wasRunning)c.pause();c.replaceDeck(deck);const resumed=c.state.paused?c.resume():false;const manual=c.enterManualStepMode();return{deck:JSON.parse(c.session.serialize()).setup.deck,manual,pausedBeforeSetup:!wasRunning,running:!c.state.paused,resumed,state:c.state};},DECK);
    assert.deepEqual(boot.deck,DECK); assert.equal(boot.pausedBeforeSetup,false); assert.equal(boot.manual,true); assert.equal(boot.running,true);
    const card=frame.locator('[data-ui="card-slot"][data-card-id="briar-band"]'); await card.waitFor(); await card.click();
    const arena=frame.locator('[data-ui="arena"]'); const arenaBox=await arena.boundingBox(); assert.ok(arenaBox&&arenaBox.width>0&&arenaBox.height>0);
    await page.mouse.click(arenaBox.x+arenaBox.width/2,arenaBox.y+arenaBox.height*.54);
    actualAttack=await child.evaluate(()=>{const c=globalThis.__spriteRendererProbe;for(let step=0;step<600;step++){const before=c.session.state;const events=c.stepMany(1);const state=c.session.state;const units=new Map(before.battle.units.map(u=>[u.id,u]));const attack=events.find(e=>e.type==='attack'&&units.get(e.attackerId)?.archetypeId==='briar-runner'&&units.get(e.attackerId)?.side==='south');if(!attack)continue;const source=state.battle.units.find(u=>u.id===attack.attackerId);if(!source)continue;const damage=events.find(e=>e.type==='damage'&&e.attackerId===attack.attackerId&&e.targetId===attack.targetId&&e.delivery==='melee'&&e.tick===attack.tick);if(!damage)continue;const marker=[...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')].find(m=>m.dataset.combatId===String(attack.attackerId));const art=marker?.querySelector('.combat-art');return{attack:{attackerId:attack.attackerId,sequence:attack.sequence,targetId:attack.targetId,tick:attack.tick,type:attack.type},damage:{amount:damage.amount,attackerId:damage.attackerId,currentHealthAfter:damage.currentHealthAfter,currentHealthBefore:damage.currentHealthBefore,delivery:damage.delivery,targetId:damage.targetId,tick:damage.tick,type:damage.type},frame:art?{action:art.dataset.spriteAction,animationAge:Number(art.dataset.attackAnimationAge),sourceClass:art.dataset.attackSourceClass??null,sourceId:Number(art.dataset.attackSourceId),sourceSequence:Number(art.dataset.attackSourceSequence),sourceTick:Number(art.dataset.attackSourceTick),tick:Number(art.dataset.simulationTick)}:null,source:{alive:source.alive,attackSequence:source.attack.attackSequence,archetypeId:source.archetypeId,delivery:source.delivery,id:source.id,hitpoints:source.hitpoints,side:source.side,sourceTick:source.spawnedAt+source.attack.nextAttackTick-source.attack.config.hitSpeedTicks},sessionTick:state.tick};}return null;});
    assert.ok(actualAttack); assert.equal(actualAttack.sessionTick-actualAttack.attack.tick,1); assert.equal(actualAttack.frame.animationAge,1);
    await frame.locator('.combat-marker[data-kind="briar-runner"]').first().waitFor({state:'attached',timeout:5000});
    const frameBox=await frameElement.boundingBox(); assert.ok(frameBox&&frameBox.width>0&&frameBox.height>0);
    const geometry=await layout(page,'contact-geometry'); const slot=geometry.nodes.slot.rect,fr=geometry.nodes.frame.rect;
    const close=(a,b)=>Math.abs(a-b)<=.01;
    const gate=close(slot.x,0)&&close(slot.y,117)&&close(slot.width,390)&&close(slot.height,659)&&close(fr.x,9.65625)&&close(fr.y,117)&&close(fr.width,370.6875)&&close(fr.height,659);
    if(!gate){const result={status:'geometry-mismatch-stop',pid:process.pid,repoCommit,actualAttack,geometry,expected:EXPECTED};writeFileSync(resolve(OUTPUT,'faithful-ablation-evidence.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));return;}
    const scaleX=frameBox.width/720,scaleY=frameBox.height/1280;
    const captureImmediate=async(name)=>{const before=await snapshot(page,child,`${name}:before-shot`,actualAttack,restoreCount);timeline.push({kind:'pre-shot-state',name,state:before});const bytes=await page.screenshot();shots[name]=bytes;writeFileSync(resolve(OUTPUT,`${name}.png`),bytes);timeline.push({kind:'shot',name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});return bytes;};
    const live=await child.evaluate(({actualAttack,sx,sy})=>{const arena=document.querySelector('[data-ui="arena"]'),r=arena.getBoundingClientRect();const markers=[...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')].map(m=>{const b=m.getBoundingClientRect(),a=m.querySelector('.combat-art'),ring=a?.querySelector('[data-team-color]'),rr=ring?.getBoundingClientRect();return{actorId:Number(m.dataset.combatId),action:a?.dataset.spriteAction??null,attackAnimationAge:a?.dataset.attackAnimationAge??null,attackSourceClass:a?.dataset.attackSourceClass??null,attackSourceId:a?.dataset.attackSourceId??null,attackSourceSequence:a?.dataset.attackSourceSequence??null,attackSourceTick:a?.dataset.attackSourceTick??null,asset:a?.querySelector('image')?.getAttribute('href')??null,direction:a?.dataset.spriteDirection??null,frame:a?.dataset.spriteFrame??null,height:Number(b.height.toFixed(4)),displayedHeight:Number((b.height*sy).toFixed(4)),side:m.classList.contains('combat-marker--north')?'north':'south',tick:Number(a?.dataset.simulationTick),width:Number(b.width.toFixed(4)),displayedWidth:Number((b.width*sx).toFixed(4)),teamColor:ring?.getAttribute('fill')??null,teamColorSide:ring?.dataset.teamColor??null,teamColorFrontmost:a?.lastElementChild===ring,teamColorRect:rr?{height:Number(rr.height.toFixed(3)),width:Number(rr.width.toFixed(3))}:null,x:Number(b.x.toFixed(2)),y:Number(b.y.toFixed(2))};});return{arena:{height:Number((r.height*sy).toFixed(2)),width:Number((r.width*sx).toFixed(2)),sourceHeight:arena.clientHeight,sourceWidth:arena.clientWidth,displayedContentHeight:Number((arena.clientHeight*sy).toFixed(2)),displayedContentWidth:Number((arena.clientWidth*sx).toFixed(2)),x:Number(r.x.toFixed(2)),y:Number(r.y.toFixed(2))},markers,actualAttack,sessionTick:globalThis.__spriteRendererProbe.state.sessionTick,unitCount:globalThis.__spriteRendererProbe.session.state.battle.units.length};},{actualAttack,sx:scaleX,sy:scaleY});
    assert.ok(live.markers.length>0); const attacked=live.markers.find(m=>m.actorId===actualAttack.attack.attackerId); assert.ok(attacked&&attacked.action==='attack'&&Number(attacked.attackAnimationAge)===1);
    const checkpoint=await child.evaluate(()=>({bytes:globalThis.__spriteRendererProbe.serialize(),combat:document.querySelector('[data-game-browser-layer="combat"]').innerHTML}));
    const checkpointSha256=createHash('sha256').update(checkpoint.bytes).digest('hex');
    const beforeRestoreScreenshot=await captureImmediate('normal-contact-before-restore');
    const screenshotMarkers=live.markers.map(m=>({actorId:m.actorId,side:m.side,color:m.teamColor,x:frameBox.x+m.x*scaleX,y:frameBox.y+m.y*scaleY,width:m.width*scaleX,height:m.height*scaleY}));

    const evolvedAttack=await child.evaluate(({sourceId,sequence})=>{const c=globalThis.__spriteRendererProbe;c.stepMany(2);const s=c.session.state,source=s.battle.units.find(u=>u.id===sourceId),m=[...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')].find(n=>n.dataset.combatId===String(sourceId)),a=m?.querySelector('.combat-art');return a?{action:a.dataset.spriteAction,animationAge:a.dataset.attackAnimationAge??null,frame:a.dataset.spriteFrame,sourceClass:a.dataset.attackSourceClass??null,sourceId:a.dataset.attackSourceId===undefined?null:Number(a.dataset.attackSourceId),sourceSequence:a.dataset.attackSourceSequence===undefined?null:Number(a.dataset.attackSourceSequence),sourceTick:a.dataset.attackSourceTick===undefined?null:Number(a.dataset.attackSourceTick),tick:Number(a.dataset.simulationTick),sequence,witness:source?{alive:source.alive,attackSequence:source.attack.attackSequence,cyclePhase:source.attack.phase,hp:source.hitpoints,pose:m.dataset.pose,sourceTick:source.spawnedAt+source.attack.nextAttackTick-source.attack.config.hitSpeedTicks,stateTick:s.tick,targetId:source.attack.targetId}:null}:null;},{sourceId:actualAttack.attack.attackerId,sequence:actualAttack.attack.sequence});
    assert.ok(evolvedAttack); assert.equal(evolvedAttack.tick,live.sessionTick+2); assert.equal(evolvedAttack.action,'walk'); assert.equal(evolvedAttack.animationAge,null); assert.equal(evolvedAttack.witness.alive,true); assert.ok(evolvedAttack.witness.hp>0); assert.notEqual(evolvedAttack.witness.targetId,actualAttack.attack.targetId);
    const teamReadability=await child.evaluate(({sourceId,sequence})=>{const c=globalThis.__spriteRendererProbe;c.stepMany(6);const markers=[...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')].map(m=>{const r=m.getBoundingClientRect(),a=m.querySelector('.combat-art'),ring=a?.querySelector('[data-team-color]');return{actorId:Number(m.dataset.combatId),color:ring?.getAttribute('fill')??null,height:r.height,side:m.classList.contains('combat-marker--north')?'north':'south',width:r.width,x:r.x,y:r.y};});return{contactOverlayVisible:[...document.querySelectorAll('.combat-melee-contact')].some(n=>n.dataset.contactId===`${sourceId}:${sequence}`),markers,tick:c.state.sessionTick};},{sourceId:actualAttack.attack.attackerId,sequence:actualAttack.attack.sequence});
    assert.equal(teamReadability.tick,live.sessionTick+8); assert.equal(teamReadability.contactOverlayVisible,false);
    const teamShot=await captureImmediate('normal-team-readability-contact-plus-8');
    const teamPixelSamples=await sampleTeamPixels(page,teamShot,screenshotMarkers);

    restoreLog.push({sequence:++restoreCount,phase:'normal-motion-contact-checkpoint',fromTick:teamReadability.tick,toTick:live.sessionTick});
    const restored=await child.evaluate(({bytes,expectedCombat})=>{const c=globalThis.__spriteRendererProbe;c.restore(bytes);c.enterManualStepMode();const after=document.querySelector('[data-game-browser-layer="combat"]').innerHTML;return{identical:expectedCombat===after,tick:c.state.sessionTick};},{bytes:checkpoint.bytes,expectedCombat:checkpoint.combat});
    assert.deepEqual(restored,{identical:true,tick:live.sessionTick});
    const afterRestoreScreenshot=await captureImmediate('normal-contact-after-restore');
    const normalRestoreDiff=await decodeDiff(page,beforeRestoreScreenshot,afterRestoreScreenshot);
    assert.equal(afterRestoreScreenshot.equals(beforeRestoreScreenshot),true,'normal contact checkpoint must restore exact viewport PNG bytes');

    await page.emulateMedia({reducedMotion:'reduce'});
    restoreLog.push({sequence:++restoreCount,phase:'late-reduced-motion-contact-checkpoint',fromTick:live.sessionTick,toTick:live.sessionTick});
    const reducedMotionState=await child.evaluate(({bytes,sourceId})=>{const c=globalThis.__spriteRendererProbe;c.restore(bytes);c.enterManualStepMode();const arts=[...document.querySelectorAll('.combat-marker[data-kind="briar-runner"] .combat-art')],marker=[...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')].find(n=>n.dataset.combatId===String(sourceId)),a=marker?.querySelector('.combat-art');return{mediaReducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,sprites:arts.map(n=>({frame:n.dataset.spriteFrame,reducedMotion:n.dataset.reducedMotion,side:n.dataset.spriteSide,teamColor:n.querySelector('[data-team-color]')?.getAttribute('fill')??null})),attack:a?{action:a.dataset.spriteAction,animationAge:Number(a.dataset.attackAnimationAge),frame:a.dataset.spriteFrame,reducedMotion:a.dataset.reducedMotion,sourceClass:a.dataset.attackSourceClass,sourceId:Number(a.dataset.attackSourceId),sourceSequence:Number(a.dataset.attackSourceSequence),sourceTick:Number(a.dataset.attackSourceTick),tick:Number(a.dataset.simulationTick)}:null,tick:c.state.sessionTick};},{bytes:checkpoint.bytes,sourceId:actualAttack.attack.attackerId});
    assert.equal(reducedMotionState.mediaReducedMotion,true); assert.equal(reducedMotionState.tick,live.sessionTick); assert.ok(reducedMotionState.attack);
    const reducedHold=await child.evaluate(({sourceId})=>{const c=globalThis.__spriteRendererProbe;c.stepMany(2);const m=[...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')].find(n=>n.dataset.combatId===String(sourceId)),a=m?.querySelector('.combat-art');return a?{action:a.dataset.spriteAction,animationAge:a.dataset.attackAnimationAge??null,frame:a.dataset.spriteFrame,reducedMotion:a.dataset.reducedMotion,sourceId:a.dataset.attackSourceId===undefined?null:Number(a.dataset.attackSourceId),sourceSequence:a.dataset.attackSourceSequence===undefined?null:Number(a.dataset.attackSourceSequence),sourceTick:a.dataset.attackSourceTick===undefined?null:Number(a.dataset.attackSourceTick),tick:Number(a.dataset.simulationTick)}:null;},{sourceId:actualAttack.attack.attackerId});
    assert.equal(reducedHold.tick,live.sessionTick+2); assert.equal(reducedHold.action,'walk');

    await waitForPaintFrames(page,child);
    const beforeReducedChildState=await snapshot(page,child,'reduced-before-child-body-shot',actualAttack,restoreCount); timeline.push({kind:'pre-shot-state',name:'reduced-before-child-body',state:beforeReducedChildState});
    const beforeReducedChild=await frame.locator('body').screenshot(); writeFileSync(resolve(OUTPUT,'reduced-before-child-body.png'),beforeReducedChild);
    const beforeReducedFingerprint=await pointFingerprint(page,child,{x:105,y:700});
    const beforeReducedPaint=await stableViewportScreenshot(page,child,'reduced-before-restore',actualAttack,restoreCount,timeline); const beforeReducedMotion=beforeReducedPaint.screenshot; shots.reducedBefore=beforeReducedMotion; writeFileSync(resolve(OUTPUT,'reduced-before-restore.png'),beforeReducedMotion);
    const reducedCheckpoint=await child.evaluate(()=>globalThis.__spriteRendererProbe.serialize()); const reducedCheckpointSha256=createHash('sha256').update(reducedCheckpoint).digest('hex');
    const beforeReducedStateTick=await child.evaluate(()=>globalThis.__spriteRendererProbe.state.sessionTick);
    await child.evaluate(bytes=>{const c=globalThis.__spriteRendererProbe;c.stepMany(1);c.restore(bytes);c.enterManualStepMode();},reducedCheckpoint);
    restoreLog.push({sequence:++restoreCount,phase:'reduced-motion-contact-plus-2-checkpoint',fromTick:beforeReducedStateTick+1,toTick:beforeReducedStateTick});
    await waitForPaintFrames(page,child);
    const afterReducedChildState=await snapshot(page,child,'reduced-after-child-body-shot',actualAttack,restoreCount); timeline.push({kind:'pre-shot-state',name:'reduced-after-child-body',state:afterReducedChildState});
    const afterReducedChild=await frame.locator('body').screenshot(); writeFileSync(resolve(OUTPUT,'reduced-after-child-body.png'),afterReducedChild);
    const afterReducedFingerprint=await pointFingerprint(page,child,{x:105,y:700});
    const afterReducedPaint=await stableViewportScreenshot(page,child,'reduced-after-restore',actualAttack,restoreCount,timeline); const afterReducedMotion=afterReducedPaint.screenshot; shots.reducedAfter=afterReducedMotion; writeFileSync(resolve(OUTPUT,'reduced-after-restore.png'),afterReducedMotion);
    const viewportEqual=afterReducedMotion.equals(beforeReducedMotion);
    const reducedDiff=await decodeDiff(page,beforeReducedMotion,afterReducedMotion);
    const pointDiff={before:beforeReducedFingerprint,after:afterReducedFingerprint,decoded:reducedDiff.firstDifferingPixels.filter(p=>p.x===105&&p.y>=695&&p.y<=710)};
    const baselinePatternPresent = reducedDiff.differingPixelCount === 5 &&
      reducedDiff.maximumChannelDelta === 3 && reducedDiff.boundingBox?.minX === 105 &&
      reducedDiff.boundingBox?.maxX === 105 && reducedDiff.boundingBox?.minY === 700 &&
      reducedDiff.boundingBox?.maxY === 704;
    const cdpBeforeInjection=await inspectCardLayer('before-injection');
    const styleInjection = await child.evaluate(() => {
      const prior = document.getElementById('frame-restore001-card-layer-ablation');
      if (prior) throw new Error('ablation style unexpectedly already exists');
      const style = document.createElement('style');
      style.id = 'frame-restore001-card-layer-ablation';
      style.textContent = '.card-slot { transform: none !important; }';
      document.head.append(style);
      const card = document.querySelector('[data-ui="card-slot"][data-card-id="brassbolt"]');
      const computed = card ? getComputedStyle(card) : null;
      return { rule: style.textContent, insertedInChildDocument: style.ownerDocument === document,
        cardTransform: computed?.transform ?? null, cardRect: card ? (() => { const r=card.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; })() : null };
    });
    timeline.push({kind:'ablation-style-injection',styleInjection});
    await waitForPaintFrames(page,child);
    const cdpAfterInjection=await inspectCardLayer('after-injection-before-restore');
    const ablationBeforeFingerprint = await pointFingerprint(page,child,{x:105,y:700});
    const ablationBeforeState = await snapshot(page,child,'ablation-before-restore',actualAttack,restoreCount);
    timeline.push({kind:'pre-shot-state',name:'ablation-before-restore',state:ablationBeforeState});
    const ablationBeforePaint = await stableViewportScreenshot(page,child,'ablation-before-restore',actualAttack,restoreCount,timeline);
    const ablationBefore = ablationBeforePaint.screenshot;
    writeFileSync(resolve(OUTPUT,'ablation-before-restore.png'),ablationBefore);
    const injectionVsBaselineDiff = await decodeDiff(page,beforeReducedMotion,ablationBefore);
    const ablationPreRestoreCheckpointSha256 = createHash('sha256').update(await child.evaluate(()=>globalThis.__spriteRendererProbe.serialize())).digest('hex');
    const ablationPreRestoreTick = await child.evaluate(()=>globalThis.__spriteRendererProbe.state.sessionTick);
    const ablationPreRestoreCardTransform = await child.evaluate(()=>getComputedStyle(document.querySelector('[data-ui="card-slot"][data-card-id="brassbolt"]')).transform);
    await child.evaluate(bytes=>{const c=globalThis.__spriteRendererProbe;c.stepMany(1);c.restore(bytes);c.enterManualStepMode();},reducedCheckpoint);
    restoreLog.push({sequence:++restoreCount,phase:'ablation-reduced-motion-contact-plus-2-checkpoint',fromTick:ablationPreRestoreTick+1,toTick:ablationPreRestoreTick});
    await waitForPaintFrames(page,child);
    const cdpAfterRestore=await inspectCardLayer('after-restore');
    const ablationAfterFingerprint = await pointFingerprint(page,child,{x:105,y:700});
    const ablationAfterState = await snapshot(page,child,'ablation-after-restore',actualAttack,restoreCount);
    timeline.push({kind:'pre-shot-state',name:'ablation-after-restore',state:ablationAfterState});
    const ablationAfterPaint = await stableViewportScreenshot(page,child,'ablation-after-restore',actualAttack,restoreCount,timeline);
    const ablationAfter = ablationAfterPaint.screenshot;
    writeFileSync(resolve(OUTPUT,'ablation-after-restore.png'),ablationAfter);
    const ablationRestoreDiff = await decodeDiff(page,ablationBefore,ablationAfter);
    const ablationPostRestoreCheckpointSha256 = createHash('sha256').update(await child.evaluate(()=>globalThis.__spriteRendererProbe.serialize())).digest('hex');
    const ablationPostRestoreTick = await child.evaluate(()=>globalThis.__spriteRendererProbe.state.sessionTick);
    const ablationPostRestoreCardTransform = await child.evaluate(()=>getComputedStyle(document.querySelector('[data-ui="card-slot"][data-card-id="brassbolt"]')).transform);
    const cdpLayerProbe = {setup:cdpSetup,beforeInjection:cdpBeforeInjection,afterInjectionBeforeRestore:cdpAfterInjection,afterRestore:cdpAfterRestore};
    const ablation = { baselinePatternPresent, styleInjection, baselineBeforeRestore:{exactPngBytes:false,diff:reducedDiff}, baselineAfterRestore:{sameAsBefore:viewportEqual,diff:reducedDiff}, injectionVsBaseline:{diff:injectionVsBaselineDiff}, beforeRestore:{tick:ablationPreRestoreTick,checkpointSha256:ablationPreRestoreCheckpointSha256,cardTransform:ablationPreRestoreCardTransform,stable:ablationBeforePaint.stable,captures:ablationBeforePaint.captures,pointFingerprint:ablationBeforeFingerprint}, afterRestore:{tick:ablationPostRestoreTick,checkpointSha256:ablationPostRestoreCheckpointSha256,cardTransform:ablationPostRestoreCardTransform,stable:ablationAfterPaint.stable,captures:ablationAfterPaint.captures,pointFingerprint:ablationAfterFingerprint}, restore:{exactPngBytes:ablationAfter.equals(ablationBefore),diff:ablationRestoreDiff}, cdpLayerProbe };
    const evidence={diagnostic:'FRAME-RESTORE001 faithful R3 lifecycle card-slot transform ablation',startedAt,pid:process.pid,repoCommit,privateCheckout:ROOT,viewport:{width:390,height:844,deviceScaleFactor:1},boot,actualAttack,contactTick:live.sessionTick,checkpointSha256,reducedCheckpointSha256,reducedCheckpointTick:beforeReducedStateTick,geometryGate:{matches:gate,actual:{slot,frame:fr},expected:EXPECTED},timeline,liveAtContact:live,evolvedAttack,teamReadability,teamPixelSamples,restores:restoreLog,restoreCount,normalRestore:{restored,exactPngBytes:afterRestoreScreenshot.equals(beforeRestoreScreenshot),decoded:normalRestoreDiff},reducedMotionState,reducedHold,beforeReducedFingerprint,afterReducedFingerprint,beforeReducedChildSha256:createHash('sha256').update(beforeReducedChild).digest('hex'),afterReducedChildSha256:createHash('sha256').update(afterReducedChild).digest('hex'),childBodyPixelIdentical:beforeReducedChild.equals(afterReducedChild),beforeStable:{stable:beforeReducedPaint.stable,captures:beforeReducedPaint.captures},afterStable:{stable:afterReducedPaint.stable,captures:afterReducedPaint.captures},reducedRestore:{exactPngBytes:viewportEqual,diff:reducedDiff,pointDiff},browserErrors:{pageErrors,consoleErrors,missingPaths},captureFiles:[...Object.keys(shots).map(n=>`${n}.png`),'ablation-before-restore.png','ablation-after-restore.png'],ablation};
    writeFileSync(resolve(OUTPUT,'faithful-ablation-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
    const status=viewportEqual?'faithful-baseline-exact':'faithful-baseline-pixel-difference';
    console.log(JSON.stringify({status,pid:process.pid,contactTick:live.sessionTick,reducedCheckpointTick:beforeReducedStateTick,geometryGate:gate,restoreCount,normalRestore:normalRestoreDiff,reducedRestore:{exactPngBytes:viewportEqual,differingPixelCount:reducedDiff.differingPixelCount,maximumChannelDelta:reducedDiff.maximumChannelDelta,boundingBox:reducedDiff.boundingBox,firstDifferingPixels:reducedDiff.firstDifferingPixels},beforeStable:beforeReducedPaint.captures,afterStable:afterReducedPaint.captures,baselinePatternPresent,ablationRestore:{exactPngBytes:ablationAfter.equals(ablationBefore),differingPixelCount:ablationRestoreDiff.differingPixelCount,maximumChannelDelta:ablationRestoreDiff.maximumChannelDelta,boundingBox:ablationRestoreDiff.boundingBox},evidence:resolve(OUTPUT,'faithful-ablation-evidence.json')}));
  } finally { if(browser) await browser.close(); await new Promise((res,rej)=>server.close(e=>e?rej(e):res())); }
}
main().catch(error=>{writeFileSync(resolve(OUTPUT,'faithful-ablation-fatal.txt'),`${error?.stack??error}\n`);console.error(error);process.exitCode=1;});
