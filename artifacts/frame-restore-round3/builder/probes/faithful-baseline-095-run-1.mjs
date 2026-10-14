import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const ROOT = "/private/tmp/frame-restore-round3-checkbase";
const OUTPUT = "/private/tmp/frame-restore-round3-builder/artifacts/frame-restore-round3/builder/baseline-095-faithful-run-1";
const CHROME = process.env.GAME_BROWSER_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const DECK = ["skymaul", "brassbolt", "reedsting", "briar-band", "cinderlings", "coilblade", "mossguard", "copperskiff"];
const EXPECTED = { slot: { x: 0, y: 117, width: 390, height: 659 }, frame: { x: 9.65625, y: 117, width: 370.6875, height: 659 } };
const MIME = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };
mkdirSync(OUTPUT, { recursive: true });
writeFileSync(resolve(OUTPUT, "runner-pid.txt"), `${process.pid}\n`);
// Accepted 095 nonbrowser proof: the real Briar melee event is tick 170. At render tick 171 the painted action is walk and combat-motion pose is attack; at tick 173 they are walk and idle because winding has 40 ticks until next attack. Accepted 095 exposes no attack-animation-age attribute.
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
    const nodeIds = window.__frameRestore001NodeIds ??= { next: 1, ids: new WeakMap() };
    const identity = (node) => {
      if (!node) return null;
      if (!nodeIds.ids.has(node)) nodeIds.ids.set(node, nodeIds.next++);
      return nodeIds.ids.get(node);
    };
    const styleKeys = ['display','position','boxSizing','width','height','margin','padding','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderTopStyle','borderRightStyle','borderBottomStyle','borderLeftStyle','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor','backgroundColor','backgroundImage','color','fontFamily','fontSize','fontWeight','lineHeight','opacity','transform','filter','willChange','contain','isolation','zIndex','boxShadow','borderRadius','transitionProperty','transitionDuration','animationName','animationDuration'];
    const describePainted = (node) => {
      if (!node) return null;
      const r = node.getBoundingClientRect(), css = getComputedStyle(node);
      const pseudo = node.matches('.hud-card') ? Object.fromEntries(['::before','::after'].map(which => { const p = getComputedStyle(node, which); return [which, { content:p.content, display:p.display, position:p.position, color:p.color, backgroundColor:p.backgroundColor, transform:p.transform, opacity:p.opacity, border:p.border, boxShadow:p.boxShadow }]; })) : null;
      return { identity: identity(node), tag: node.tagName, className: typeof node.className === 'string' ? node.className : null, id: node.id || null, dataset: { ...node.dataset }, rect: { x:r.x, y:r.y, width:r.width, height:r.height }, style: Object.fromEntries(styleKeys.map(key => [key, css[key]])), pseudo, html: node.outerHTML };
    };
    const paintedCards = [...document.querySelectorAll('.hud-card[data-slot]')].map(describePainted);
    const hudLayer = describePainted(document.querySelector('.game-browser-layer--hud'));
    const card = document.querySelector('.hud-card[data-card-id="brassbolt"]');
    const cardStyle = card ? getComputedStyle(card) : null;
    const cardRect = card?.getBoundingClientRect();
    const audio = document.querySelector('[data-ui="audio-toggle"]');
    const current = [...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')].map((m) => {
      const art = m.querySelector('.combat-art'), r = m.getBoundingClientRect();
      return { id: Number(m.dataset.combatId), side: m.classList.contains('combat-marker--north') ? 'north' : 'south', rect: { x: r.x, y: r.y, width: r.width, height: r.height }, action: art?.dataset.spriteAction ?? null, age: art?.dataset.attackAnimationAge ?? null, frame: art?.dataset.spriteFrame ?? null, direction: art?.dataset.spriteDirection ?? null, tick: art?.dataset.simulationTick ?? null, reducedMotion: art?.dataset.reducedMotion ?? null, sourceId: art?.dataset.attackSourceId ?? null, sourceSequence: art?.dataset.attackSourceSequence ?? null, sourceTick: art?.dataset.attackSourceTick ?? null };
    });
    const controls = [...document.querySelectorAll('input,select,textarea,button')].map((n) => ({ tag: n.tagName, ui: n.dataset.ui ?? null, value: 'value' in n ? n.value : null, checked: 'checked' in n ? n.checked : null, pressed: n.getAttribute('aria-pressed'), text: n.textContent?.trim() ?? '', disabled: n.disabled, focus: n === document.activeElement, hover: n.matches(':hover') }));
    const cardDescribe = card ? { identity: identity(card), rect: { x: cardRect.x, y: cardRect.y, width: cardRect.width, height: cardRect.height }, transform: cardStyle.transform, willChange: cardStyle.willChange, transitionDuration: cardStyle.transitionDuration, transitionProperty: cardStyle.transitionProperty, matchesFocus: card.matches(':focus'), matchesFocusVisible: card.matches(':focus-visible'), matchesHover: card.matches(':hover'), html: card.outerHTML, parent: (() => { const p = card.parentElement, r = p.getBoundingClientRect(), s = getComputedStyle(p); return { identity: identity(p), className: p.className, rect: { x:r.x,y:r.y,width:r.width,height:r.height }, transform:s.transform, willChange:s.willChange, boxShadow:s.boxShadow }; })() } : null;
    const resourceEntries = performance.getEntriesByType('resource').map(({ name, initiatorType, transferSize, encodedBodySize, decodedBodySize, responseEnd }) => ({ name, initiatorType, transferSize, encodedBodySize, decodedBodySize, responseEnd }));
    const safeJson = (value) => { try { return JSON.stringify(value); } catch (error) { return `!serialization-error:${error}`; } };
    const audit = {
      browserSnapshot: c.serialize(),
      sessionBytes: c.session.serialize(),
      controllerState: safeJson(c.state),
      audioState: safeJson(c.audio),
      audioDiagnostics: safeJson(c.audioDiagnostics),
      audioMixAudit: safeJson(c.audioMixAudit),
      audioContinuationBytes: c.audioContinuationBytes,
      audioPcmObservations: safeJson(c.audioPcmObservations),
      inputDom: safeJson([...document.querySelectorAll('input,select,textarea,button')].map((n) => ({ tag:n.tagName,ui:n.dataset.ui??null,value:'value' in n?n.value:null,checked:'checked' in n?n.checked:null,pressed:n.getAttribute('aria-pressed'),disabled:n.disabled,focus:n===document.activeElement,hover:n.matches(':hover') }))),
      inputDom: safeJson([...document.querySelectorAll('input,select,textarea,button')].map((n) => ({ tag:n.tagName,ui:n.dataset.ui??null,value:'value' in n?n.value:null,checked:'checked' in n?n.checked:null,pressed:n.getAttribute('aria-pressed'),disabled:n.disabled,focus:n===document.activeElement,hover:n.matches(':hover') }))),
    };
    return { phase, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, sessionTick: c.state.sessionTick, serializedSha256: null, controllerState: c.state, audit, painted: { hudLayer, cards: paintedCards }, source: source ? { id: source.id, alive: source.alive, hp: source.hitpoints, side: source.side, archetypeId: source.archetypeId, attack: source.attack } : null, sourceEvent: attackMeta, activeElement: document.activeElement ? { tag: document.activeElement.tagName, id: document.activeElement.id, className: typeof document.activeElement.className === 'string' ? document.activeElement.className : null } : null, card: cardDescribe, audio: audio ? { text: audio.textContent.trim(), pressed: audio.getAttribute('aria-pressed'), label: audio.getAttribute('aria-label'), html: audio.outerHTML } : null, controls, sprites: current, bodyText: document.body.innerText, fonts: document.fonts.status, resourceEntries, activeAnimations: document.getAnimations({ subtree: true }).map((a) => ({ playState: a.playState, currentTime: a.currentTime, target: a.effect?.target?.className ?? a.effect?.target?.tagName ?? null })), restoreCount: restores };
  }, { label, attackMeta: attack, restores: restoreCount });
  const serialized = await child.evaluate(() => globalThis.__spriteRendererProbe.serialize());
  inner.serializedSha256 = createHash("sha256").update(serialized).digest("hex");
  inner.auditFingerprints = Object.fromEntries(Object.entries(inner.audit).map(([key, value]) => [key, { byteLength: Buffer.byteLength(value), sha256: createHash('sha256').update(value).digest('hex') }]));
  delete inner.audit;
  return { outer, inner };
}

async function controllerAudit(child) {
  return child.evaluate(() => {
    const c = globalThis.__spriteRendererProbe;
    const safeJson = (value) => { try { return JSON.stringify(value) ?? 'undefined'; } catch (error) { return `!serialization-error:${error}`; } };
    const identities = window.__frameRestore001NodeIds ??= { next: 1, ids: new WeakMap() };
    const identity = (node) => { if (!identities.ids.has(node)) identities.ids.set(node, identities.next++); return identities.ids.get(node); };
    const keys = ['display','position','boxSizing','width','height','margin','padding','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','borderTopStyle','borderRightStyle','borderBottomStyle','borderLeftStyle','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor','backgroundColor','backgroundImage','color','fontFamily','fontSize','fontWeight','lineHeight','opacity','transform','filter','willChange','contain','isolation','zIndex','boxShadow','borderRadius','transitionProperty','transitionDuration','animationName','animationDuration'];
    const painted = [...document.querySelectorAll('.game-browser-layer--hud,.hud-card[data-slot]')].map(node => {
      const r=node.getBoundingClientRect(), css=getComputedStyle(node);
      return {identity:identity(node),tag:node.tagName,className:typeof node.className==='string'?node.className:null,dataset:{...node.dataset},rect:{x:r.x,y:r.y,width:r.width,height:r.height},style:Object.fromEntries(keys.map(key=>[key,css[key]])),html:node.outerHTML};
    });
    return {
      browserSnapshot: c.serialize(),
      sessionBytes: c.session.serialize(),
      controllerState: safeJson(c.state),
      audioState: safeJson(c.audio),
      audioDiagnostics: safeJson(c.audioDiagnostics),
      audioMixAudit: safeJson(c.audioMixAudit),
      audioContinuationBytes: c.audioContinuationBytes,
      audioPcmObservations: safeJson(c.audioPcmObservations),
      inputDom: safeJson([...document.querySelectorAll('input,select,textarea,button')].map((n) => ({ tag:n.tagName,ui:n.dataset.ui??null,value:'value' in n?n.value:null,checked:'checked' in n?n.checked:null,pressed:n.getAttribute('aria-pressed'),disabled:n.disabled,focus:n===document.activeElement,hover:n.matches(':hover') }))),
      documentHtml: document.documentElement.outerHTML,
      paintedNodes: safeJson(painted),
      fonts: safeJson({status:document.fonts.status,faces:[...document.fonts].map(face=>({family:face.family,style:face.style,weight:face.weight,status:face.status}))}),
      resources: safeJson(performance.getEntriesByType('resource').map(({name,initiatorType,transferSize,encodedBodySize,decodedBodySize,responseEnd})=>({name,initiatorType,transferSize,encodedBodySize,decodedBodySize,responseEnd}))),
    };
  });
}

function auditSummary(audit) {
  return Object.fromEntries(Object.entries(audit).map(([key, value]) => [key, {
    byteLength: Buffer.byteLength(value),
    sha256: createHash('sha256').update(value).digest('hex'),
  }]));
}

function compareAudits(before, after) {
  return Object.fromEntries(Object.keys(before).map(key => [key, {
    byteIdentical: before[key] === after[key],
    before: auditSummary({ [key]: before[key] })[key],
    after: auditSummary({ [key]: after[key] })[key],
  }]));
}

async function stableViewportScreenshot(page, child, label, attack, restoreCount, timeline) {
  await Promise.all([page.evaluate(() => document.fonts.ready), child.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined))); })]);
  let previous = null;
  for (let captures = 1; captures <= 2; captures += 1) {
    await waitForPaintFrames(page, child);
    const beforeShot = await snapshot(page, child, `${label}:outer-capture-${captures}`, attack, restoreCount);
    timeline.push({ kind: "pre-outer-capture-state", capture: label, index: captures, state: beforeShot });
    const screenshot = await page.screenshot();
    writeFileSync(resolve(OUTPUT, `${label}-outer-capture-${captures}.png`), screenshot);
    if (previous !== null && screenshot.equals(previous)) return { captures, screenshot, stable: true };
    previous = screenshot;
  }
  return { captures: 2, screenshot: previous, stable: false };
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
  assert.equal(repoCommit,'095a8c55a6721c74f7555939a9ce21182bec3f2a');
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
        const documentNode=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
        const slots=await cdp.send('Runtime.evaluate',{expression:"document.querySelectorAll('.hud-card[data-slot]').length",contextId,returnByValue:true});
        const slotCount=slots.result?.value??0;
        const expressions=[{label:'hud-layer',expression:"document.querySelector('.game-browser-layer--hud')"}];
        for(let index=0;index<slotCount;index++) expressions.push({label:`hud-card-${index}`,expression:`document.querySelectorAll('.hud-card[data-slot]')[${index}]`});
        const targets=[];
        for(const target of expressions){
          const remote=await cdp.send('Runtime.evaluate',{expression:target.expression,contextId,returnByValue:false});
          const objectId=remote.result?.objectId;
          if(!objectId){targets.push({label:target.label,available:false,reason:'query returned no remote node',exception:remote.exceptionDetails?.text??null});continue;}
          try{
            const requested=await cdp.send('DOM.requestNode',{objectId});
            const described=await cdp.send('DOM.describeNode',{nodeId:requested.nodeId,depth:0});
            const backendNodeId=described.node?.backendNodeId??null;
            const matches=(latestLayerTree??[]).filter(layer=>layer.backendNodeId===backendNodeId);
            const layers=[];
            for(const layer of matches){let reasons=null,reasonError=null;try{reasons=await cdp.send('LayerTree.compositingReasons',{layerId:layer.layerId});}catch(error){reasonError=String(error);}layers.push({layerId:layer.layerId,backendNodeId:layer.backendNodeId,width:layer.width,height:layer.height,offsetX:layer.offsetX,offsetY:layer.offsetY,transform:layer.transform??null,drawsContent:layer.drawsContent??null,compositingReasons:reasons?.compositingReasons??null,reasonError});}
            targets.push({label:target.label,available:true,nodeId:requested.nodeId,backendNodeId,description:described.node?{nodeName:described.node.nodeName,localName:described.node.localName,attributes:described.node.attributes}:null,matchingLayers:layers});
          }catch(error){targets.push({label:target.label,available:false,reason:String(error),objectId,documentRootNodeId:documentNode.root?.nodeId??null});}
        }
        return {phase,available:true,frameId,contextId,slotCount,layerTreeCount:latestLayerTree?.length??0,layerTreeBackendNodeIds:[...(latestLayerTree??[])].map(layer=>layer.backendNodeId??null),targets};
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
    actualAttack=await child.evaluate(()=>{const c=globalThis.__spriteRendererProbe;for(let step=0;step<600;step++){const before=c.session.state;const events=c.stepMany(1);const state=c.session.state;const units=new Map(before.battle.units.map(u=>[u.id,u]));const attack=events.find(e=>e.type==='attack'&&units.get(e.attackerId)?.archetypeId==='briar-runner'&&units.get(e.attackerId)?.side==='south');if(!attack)continue;const source=state.battle.units.find(u=>u.id===attack.attackerId);if(!source)continue;const damage=events.find(e=>e.type==='damage'&&e.attackerId===attack.attackerId&&e.targetId===attack.targetId&&e.delivery==='melee'&&e.tick===attack.tick);if(!damage)continue;const marker=[...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')].find(m=>m.dataset.combatId===String(attack.attackerId));const art=marker?.querySelector('.combat-art');return{attack:{attackerId:attack.attackerId,sequence:attack.sequence,targetId:attack.targetId,tick:attack.tick,type:attack.type},damage:{amount:damage.amount,attackerId:damage.attackerId,currentHealthAfter:damage.currentHealthAfter,currentHealthBefore:damage.currentHealthBefore,delivery:damage.delivery,targetId:damage.targetId,tick:damage.tick,type:damage.type},frame:art?{action:art.dataset.spriteAction??null,attackAge:art.dataset.attackAnimationAge??null,pose:marker?.dataset.pose??null,tick:Number(art.dataset.simulationTick)}:null,source:{alive:source.alive,attackSequence:source.attack.attackSequence,archetypeId:source.archetypeId,delivery:source.delivery,id:source.id,hitpoints:source.hitpoints,side:source.side,targetId:source.attack.targetId,phase:source.attack.phase,nextTick:source.attack.nextTick,nextAttackTick:source.attack.nextAttackTick,sourceTick:source.spawnedAt+source.attack.nextAttackTick-source.attack.config.hitSpeedTicks},sessionTick:state.tick};}return null;});
    assert.ok(actualAttack); assert.equal(actualAttack.attack.tick,170); assert.equal(actualAttack.sessionTick,171); assert.equal(actualAttack.attack.type,'attack'); assert.equal(actualAttack.damage.delivery,'melee'); assert.equal(actualAttack.damage.amount,120); assert.equal(actualAttack.damage.currentHealthBefore,81); assert.equal(actualAttack.damage.currentHealthAfter,0); assert.equal(actualAttack.source.id,1); assert.equal(actualAttack.source.archetypeId,'briar-runner'); assert.equal(actualAttack.source.phase,'cycling'); assert.equal(actualAttack.source.targetId,9); assert.equal(actualAttack.source.nextTick,171); assert.equal(actualAttack.source.nextAttackTick,236); assert.equal(actualAttack.frame.action,'walk'); assert.equal(actualAttack.frame.attackAge,null); assert.equal(actualAttack.frame.pose,'attack'); assert.equal(actualAttack.frame.tick,171);
    await frame.locator('.combat-marker[data-kind="briar-runner"]').first().waitFor({state:'attached',timeout:5000});
    const frameBox=await frameElement.boundingBox(); assert.ok(frameBox&&frameBox.width>0&&frameBox.height>0);
    const geometry=await layout(page,'contact-geometry'); const slot=geometry.nodes.slot.rect,fr=geometry.nodes.frame.rect;
    const close=(a,b)=>Math.abs(a-b)<=.01;
    const gate=close(slot.x,0)&&close(slot.y,117)&&close(slot.width,390)&&close(slot.height,659)&&close(fr.x,9.65625)&&close(fr.y,117)&&close(fr.width,370.6875)&&close(fr.height,659);
    if(!gate){const result={status:'geometry-mismatch-stop',pid:process.pid,repoCommit,actualAttack,geometry,expected:EXPECTED};writeFileSync(resolve(OUTPUT,'frame-restore-001-causal-evidence.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));return;}
    const scaleX=frameBox.width/720,scaleY=frameBox.height/1280;
    const captureImmediate=async(name)=>{const before=await snapshot(page,child,`${name}:before-shot`,actualAttack,restoreCount);timeline.push({kind:'pre-shot-state',name,state:before});const bytes=await page.screenshot();shots[name]=bytes;writeFileSync(resolve(OUTPUT,`${name}.png`),bytes);timeline.push({kind:'shot',name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});return bytes;};
    const live=await child.evaluate(({actualAttack,sx,sy})=>{const arena=document.querySelector('[data-ui="arena"]'),r=arena.getBoundingClientRect();const markers=[...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')].map(m=>{const b=m.getBoundingClientRect(),a=m.querySelector('.combat-art'),ring=a?.querySelector('[data-team-color]'),rr=ring?.getBoundingClientRect();return{actorId:Number(m.dataset.combatId),action:a?.dataset.spriteAction??null,pose:m.dataset.pose??null,attackAnimationAge:a?.dataset.attackAnimationAge??null,attackSourceClass:a?.dataset.attackSourceClass??null,attackSourceId:a?.dataset.attackSourceId??null,attackSourceSequence:a?.dataset.attackSourceSequence??null,attackSourceTick:a?.dataset.attackSourceTick??null,asset:a?.querySelector('image')?.getAttribute('href')??null,direction:a?.dataset.spriteDirection??null,frame:a?.dataset.spriteFrame??null,height:Number(b.height.toFixed(4)),displayedHeight:Number((b.height*sy).toFixed(4)),side:m.classList.contains('combat-marker--north')?'north':'south',tick:Number(a?.dataset.simulationTick),width:Number(b.width.toFixed(4)),displayedWidth:Number((b.width*sx).toFixed(4)),teamColor:ring?.getAttribute('fill')??null,teamColorSide:ring?.dataset.teamColor??null,teamColorFrontmost:a?.lastElementChild===ring,teamColorRect:rr?{height:Number(rr.height.toFixed(3)),width:Number(rr.width.toFixed(3))}:null,x:Number(b.x.toFixed(2)),y:Number(b.y.toFixed(2))};});return{arena:{height:Number((r.height*sy).toFixed(2)),width:Number((r.width*sx).toFixed(2)),sourceHeight:arena.clientHeight,sourceWidth:arena.clientWidth,displayedContentHeight:Number((arena.clientHeight*sy).toFixed(2)),displayedContentWidth:Number((arena.clientWidth*sx).toFixed(2)),x:Number(r.x.toFixed(2)),y:Number(r.y.toFixed(2))},markers,actualAttack,sessionTick:globalThis.__spriteRendererProbe.state.sessionTick,unitCount:globalThis.__spriteRendererProbe.session.state.battle.units.length};},{actualAttack,sx:scaleX,sy:scaleY});
    assert.ok(live.markers.length>0); const attacked=live.markers.find(m=>m.actorId===actualAttack.attack.attackerId); assert.ok(attacked&&attacked.action==='walk'&&attacked.pose==='attack'&&attacked.attackAnimationAge===null&&attacked.tick===live.sessionTick);
    const checkpoint=await child.evaluate(()=>({bytes:globalThis.__spriteRendererProbe.serialize(),combat:document.querySelector('[data-game-browser-layer="combat"]').innerHTML}));
    const checkpointSha256=createHash('sha256').update(checkpoint.bytes).digest('hex');
    const beforeRestoreScreenshot=await captureImmediate('normal-contact-before-restore');
    const screenshotMarkers=live.markers.map(m=>({actorId:m.actorId,side:m.side,color:m.teamColor,x:frameBox.x+m.x*scaleX,y:frameBox.y+m.y*scaleY,width:m.width*scaleX,height:m.height*scaleY}));

    const evolvedAttack=await child.evaluate(({sourceId,sequence})=>{const c=globalThis.__spriteRendererProbe;c.stepMany(2);const s=c.session.state,source=s.battle.units.find(u=>u.id===sourceId),m=[...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')].find(n=>n.dataset.combatId===String(sourceId)),a=m?.querySelector('.combat-art');return a?{action:a.dataset.spriteAction??null,pose:m?.dataset.pose??null,tick:Number(a.dataset.simulationTick),sequence,witness:source?{alive:source.alive,attackSequence:source.attack.attackSequence,cyclePhase:source.attack.phase,hp:source.hitpoints,nextTick:source.attack.nextTick,nextAttackTick:source.attack.nextAttackTick,pose:m.dataset.pose,sourceTick:source.spawnedAt+source.attack.nextAttackTick-source.attack.config.hitSpeedTicks,stateTick:s.tick,targetId:source.attack.targetId}:null}:null;},{sourceId:actualAttack.attack.attackerId,sequence:actualAttack.attack.sequence});
    assert.ok(evolvedAttack); assert.equal(evolvedAttack.tick,173); assert.equal(evolvedAttack.action,'walk'); assert.equal(evolvedAttack.pose,'idle'); assert.equal(evolvedAttack.witness.pose,'idle'); assert.equal(evolvedAttack.witness.alive,true); assert.equal(evolvedAttack.witness.hp,121); assert.equal(evolvedAttack.witness.cyclePhase,'winding'); assert.equal(evolvedAttack.witness.nextTick,173); assert.equal(evolvedAttack.witness.nextAttackTick,213); assert.equal(evolvedAttack.witness.targetId,10); assert.notEqual(evolvedAttack.witness.targetId,actualAttack.attack.targetId);
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
    const reducedMotionState=await child.evaluate(({bytes,sourceId})=>{const c=globalThis.__spriteRendererProbe;c.restore(bytes);c.enterManualStepMode();const arts=[...document.querySelectorAll('.combat-marker[data-kind="briar-runner"] .combat-art')],marker=[...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')].find(n=>n.dataset.combatId===String(sourceId)),a=marker?.querySelector('.combat-art');return{mediaReducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,sprites:arts.map(n=>({frame:n.dataset.spriteFrame,reducedMotion:n.dataset.reducedMotion,side:n.dataset.spriteSide,teamColor:n.querySelector('[data-team-color]')?.getAttribute('fill')??null})),attack:a?{action:a.dataset.spriteAction??null,pose:marker?.dataset.pose??null,tick:Number(a.dataset.simulationTick),reducedMotion:a.dataset.reducedMotion}:null,tick:c.state.sessionTick};},{bytes:checkpoint.bytes,sourceId:actualAttack.attack.attackerId});
    assert.equal(reducedMotionState.mediaReducedMotion,true); assert.equal(reducedMotionState.tick,171); assert.ok(reducedMotionState.attack); assert.equal(reducedMotionState.attack.action,'walk'); assert.equal(reducedMotionState.attack.pose,'attack'); assert.equal(reducedMotionState.attack.tick,171); assert.equal(reducedMotionState.attack.reducedMotion,'true');
    const reducedHold=await child.evaluate(({sourceId})=>{const c=globalThis.__spriteRendererProbe;c.stepMany(2);const m=[...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')].find(n=>n.dataset.combatId===String(sourceId)),a=m?.querySelector('.combat-art');return a?{action:a.dataset.spriteAction??null,pose:m?.dataset.pose??null,tick:Number(a.dataset.simulationTick),reducedMotion:a.dataset.reducedMotion}:null;},{sourceId:actualAttack.attack.attackerId});
    assert.equal(reducedHold.tick,173); assert.equal(reducedHold.action,'walk'); assert.equal(reducedHold.pose,'idle'); assert.equal(reducedHold.reducedMotion,'true');

    await waitForPaintFrames(page,child);
    const beforeReducedChildState=await snapshot(page,child,'reduced-before-child-body-shot',actualAttack,restoreCount); timeline.push({kind:'pre-shot-state',name:'reduced-before-child-body',state:beforeReducedChildState});
    const beforeReducedChild=await frame.locator('body').screenshot(); writeFileSync(resolve(OUTPUT,'reduced-before-child-body.png'),beforeReducedChild);
    const beforeReducedFingerprint=await pointFingerprint(page,child,{x:105,y:700});
    const beforeReducedPaint=await stableViewportScreenshot(page,child,'reduced-before-restore',actualAttack,restoreCount,timeline); const beforeReducedMotion=beforeReducedPaint.screenshot; shots.reducedBefore=beforeReducedMotion; writeFileSync(resolve(OUTPUT,'reduced-before-restore.png'),beforeReducedMotion);
    const reducedCheckpoint=await child.evaluate(()=>globalThis.__spriteRendererProbe.serialize()); const reducedCheckpointSha256=createHash('sha256').update(reducedCheckpoint).digest('hex');
    const beforeReducedStateTick=await child.evaluate(()=>globalThis.__spriteRendererProbe.state.sessionTick);
    const checkpointBeforeZero=await controllerAudit(child);
    const cdpBeforeZero=await inspectCardLayer('reduced-baseline-before-stepMany-zero');
    let zeroStepResult;
    try {
      zeroStepResult=await child.evaluate(()=>{const c=globalThis.__spriteRendererProbe;const events=c.stepMany(0);return{accepted:true,eventCount:events.length,events,tick:c.state.sessionTick};});
    } catch(error) { zeroStepResult={accepted:false,error:String(error)}; }
    const checkpointAfterZero=await controllerAudit(child);
    await waitForPaintFrames(page,child);
    const cdpAfterZero=await inspectCardLayer('reduced-after-stepMany-zero-before-restore');
    const zeroStepPaint=await stableViewportScreenshot(page,child,'reduced-after-stepMany-zero',actualAttack,restoreCount,timeline);
    const zeroStepViewport=zeroStepPaint.screenshot; writeFileSync(resolve(OUTPUT,'reduced-after-stepMany-zero.png'),zeroStepViewport);
    const zeroStepDiff=await decodeDiff(page,beforeReducedMotion,zeroStepViewport);
    const zeroStepState=await snapshot(page,child,'reduced-after-stepMany-zero-state',actualAttack,restoreCount);
    const zeroStepAuditComparison=compareAudits(checkpointBeforeZero,checkpointAfterZero);
    const exactPublicNoOp=zeroStepResult.accepted===true&&zeroStepResult.eventCount===0&&Object.values(zeroStepAuditComparison).every(item=>item.byteIdentical);
    const preRestoreAudit=await controllerAudit(child);
    const preRestoreState=await snapshot(page,child,'reduced-before-plus1-restore-state',actualAttack,restoreCount);
    const preRestoreFingerprint=await pointFingerprint(page,child,{x:105,y:700});
    const cdpBeforeRestore=await inspectCardLayer('reduced-before-plus1-restore');
    const plusOneAndRestore=await child.evaluate(bytes=>{const c=globalThis.__spriteRendererProbe;const fromTick=c.state.sessionTick;const events=c.stepMany(1);const advancedTick=c.state.sessionTick;c.restore(bytes);const restoredTick=c.state.sessionTick;const manual=c.enterManualStepMode();return{eventCount:events.length,fromTick,advancedTick,restoredTick,manual};},reducedCheckpoint);
    restoreLog.push({sequence:++restoreCount,phase:'reduced-motion-contact-plus-2-checkpoint',fromTick:plusOneAndRestore.fromTick,toTick:plusOneAndRestore.restoredTick,oneTickEvents:plusOneAndRestore.eventCount,manual:plusOneAndRestore.manual});
    await waitForPaintFrames(page,child);
    const cdpAfterRestore=await inspectCardLayer('reduced-after-plus1-restore');
    const afterReducedChildState=await snapshot(page,child,'reduced-after-child-body-shot',actualAttack,restoreCount); timeline.push({kind:'pre-shot-state',name:'reduced-after-child-body',state:afterReducedChildState});
    const afterReducedChild=await frame.locator('body').screenshot(); writeFileSync(resolve(OUTPUT,'reduced-after-child-body.png'),afterReducedChild);
    const afterReducedFingerprint=await pointFingerprint(page,child,{x:105,y:700});
    const afterRestoreState=await snapshot(page,child,'reduced-after-plus1-restore-state',actualAttack,restoreCount);
    const afterReducedPaint=await stableViewportScreenshot(page,child,'reduced-after-plus1-restore',actualAttack,restoreCount,timeline); const afterReducedMotion=afterReducedPaint.screenshot; shots.reducedAfter=afterReducedMotion; writeFileSync(resolve(OUTPUT,'reduced-after-plus1-restore.png'),afterReducedMotion);
    const afterRestoreAudit=await controllerAudit(child);
    const noOpToRestoreAuditComparison=compareAudits(preRestoreAudit,afterRestoreAudit);
    const viewportEqual=afterReducedMotion.equals(beforeReducedMotion);
    const reducedDiff=await decodeDiff(page,beforeReducedMotion,afterReducedMotion);
    const noOpToRestoreDiff=await decodeDiff(page,zeroStepViewport,afterReducedMotion);
    const pointDiff={before:beforeReducedFingerprint,after:afterReducedFingerprint,decoded:reducedDiff.firstDifferingPixels.filter(p=>p.x===105&&p.y>=695&&p.y<=710)};
    const baselinePatternPresent = reducedDiff.differingPixelCount === 5 &&
      reducedDiff.maximumChannelDelta === 3 && reducedDiff.boundingBox?.minX === 105 &&
      reducedDiff.boundingBox?.maxX === 105 && reducedDiff.boundingBox?.minY === 700 &&
      reducedDiff.boundingBox?.maxY === 704;
    const cdpLayerProbe={setup:cdpSetup,beforeZeroStep:cdpBeforeZero,afterZeroStepBeforeRestore:cdpAfterZero,beforeRestore:cdpBeforeRestore,afterRestore:cdpAfterRestore};
    const causalProbe={zeroStep:{result:zeroStepResult,legalAndByteIdentical:exactPublicNoOp,auditBefore:auditSummary(checkpointBeforeZero),auditAfter:auditSummary(checkpointAfterZero),auditComparison:zeroStepAuditComparison,viewportAgainstBaseline:{exactPngBytes:zeroStepViewport.equals(beforeReducedMotion),diff:zeroStepDiff},stable:{stable:zeroStepPaint.stable,captures:zeroStepPaint.captures}},restore:{operation:plusOneAndRestore,preRestoreAudit:auditSummary(preRestoreAudit),postRestoreAudit:auditSummary(afterRestoreAudit),auditComparison:noOpToRestoreAuditComparison,viewportAgainstPreRestore:{exactPngBytes:afterReducedMotion.equals(zeroStepViewport),diff:noOpToRestoreDiff},stable:{stable:afterReducedPaint.stable,captures:afterReducedPaint.captures}},cdpLayerProbe,preRestorePainted:preRestoreState.inner.painted,postRestorePainted:afterRestoreState.inner.painted,preRestoreFingerprint,postRestoreFingerprint:afterReducedFingerprint};
    const evidence={diagnostic:'FRAME-RESTORE001 faithful accepted-095 lifecycle stepMany(0) audit and +1/restore',startedAt,pid:process.pid,repoCommit,privateCheckout:ROOT,viewport:{width:390,height:844,deviceScaleFactor:1},boot,actualAttack,contactTick:live.sessionTick,checkpointSha256,reducedCheckpointSha256,reducedCheckpointTick:beforeReducedStateTick,geometryGate:{matches:gate,actual:{slot,frame:fr},expected:EXPECTED},timeline,liveAtContact:live,evolvedAttack,teamReadability,teamPixelSamples,restores:restoreLog,restoreCount,normalRestore:{restored,exactPngBytes:afterRestoreScreenshot.equals(beforeRestoreScreenshot),decoded:normalRestoreDiff},reducedMotionState,reducedHold,beforeReducedFingerprint,afterReducedFingerprint,beforeReducedChildSha256:createHash('sha256').update(beforeReducedChild).digest('hex'),afterReducedChildSha256:createHash('sha256').update(afterReducedChild).digest('hex'),childBodyPixelIdentical:beforeReducedChild.equals(afterReducedChild),beforeStable:{stable:beforeReducedPaint.stable,captures:beforeReducedPaint.captures},zeroStepStable:{stable:zeroStepPaint.stable,captures:zeroStepPaint.captures},afterStable:{stable:afterReducedPaint.stable,captures:afterReducedPaint.captures},reducedRestore:{exactPngBytes:viewportEqual,diff:reducedDiff,pointDiff},browserErrors:{pageErrors,consoleErrors,missingPaths},captureFiles:[...Object.keys(shots).map(n=>`${n}.png`),'reduced-after-stepMany-zero.png','reduced-after-plus1-restore.png'],causalProbe};
    writeFileSync(resolve(OUTPUT,'frame-restore-001-causal-evidence.json'),JSON.stringify(evidence,null,2)+'\n');
    const status=viewportEqual?'faithful-baseline-exact':'faithful-baseline-pixel-difference';
    console.log(JSON.stringify({status,pid:process.pid,contactTick:live.sessionTick,reducedCheckpointTick:beforeReducedStateTick,geometryGate:gate,restoreCount,normalRestore:normalRestoreDiff,reducedRestore:{exactPngBytes:viewportEqual,differingPixelCount:reducedDiff.differingPixelCount,maximumChannelDelta:reducedDiff.maximumChannelDelta,boundingBox:reducedDiff.boundingBox,firstDifferingPixels:reducedDiff.firstDifferingPixels},stepManyZero:{result:zeroStepResult,legalAndByteIdentical:exactPublicNoOp,viewportDiffCount:zeroStepDiff.differingPixelCount,stable:zeroStepPaint.stable},plusOneRestore:{exactPngBytes:afterReducedMotion.equals(zeroStepViewport),diffCount:noOpToRestoreDiff.differingPixelCount,maximumChannelDelta:noOpToRestoreDiff.maximumChannelDelta,boundingBox:noOpToRestoreDiff.boundingBox,stable:afterReducedPaint.stable},evidence:resolve(OUTPUT,'frame-restore-001-causal-evidence.json')}));
  } finally { if(browser) await browser.close(); await new Promise((res,rej)=>server.close(e=>e?rej(e):res())); }
}
main().catch(error=>{writeFileSync(resolve(OUTPUT,'frame-restore-001-causal-fatal.txt'),`${error?.stack??error}\n`);console.error(error);process.exitCode=1;});
