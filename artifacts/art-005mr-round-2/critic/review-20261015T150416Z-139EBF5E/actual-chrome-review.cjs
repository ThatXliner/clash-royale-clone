const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn, spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const output = __dirname;
const repo = path.join(output, "private-checkout");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const { chromium } = require(path.join(repo, "node_modules", "playwright"));
const playwrightVersion = require(path.join(repo, "node_modules", "playwright", "package.json")).version;
const screenshotFiles = {
  before: "before-original-vector-1440x1200.png",
  after: "after-vector-rig-1440x1200.png",
  comparison: "comparison-default-1440x1200.png",
  diagnostic: "enlarged-diagnostic-only.png",
};
const capture = { playwrightVersion, chromePath, screenshots: {}, consoleErrors: [], pageErrors: [], requestFailures: [], requests: [], commands: {}, audit: null };
let server, chromeProcess, browser, page;
let chromeStdout = "", chromeStderr = "";
const profile = path.join(output, "chrome-profile");
fs.mkdirSync(profile, { recursive: true });
const sourceText = fs.readFileSync(path.join(repo, "demo/mossguard-vector-rig.js"), "utf8");
capture.explicitInputStaticAudit = {
  forbiddenNondeterminismTokens: ["Math.random", "Date.now", "new Date(", "performance.now", "setInterval"].filter((token) => sourceText.includes(token)),
  hasClockDrivenAnimation: /requestAnimationFrame|setInterval|setTimeout/.test(sourceText),
  hasExplicitTickValidation: /Number\.isSafeInteger\(tick\)/.test(sourceText),
  hasReferenceImport: /(?:\.\.\/|\.\/)?reference\//.test(sourceText),
  imports: [...sourceText.matchAll(/^import\s+.*?from\s+["']([^"']+)/gm)].map(([, spec]) => spec),
};
function saveText(name, text) { fs.writeFileSync(path.join(output, name), text); }
function pngDimensions(buf) { return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }; }
function waitForDevtools(portFile, timeoutMs) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (chromeProcess && chromeProcess.exitCode !== null) return reject(new Error(`Chrome exited early: ${chromeProcess.exitCode}`));
      if (fs.existsSync(portFile)) {
        const lines = fs.readFileSync(portFile, "utf8").trim().split(/\r?\n/);
        if (lines.length >= 2 && lines[0]) return resolve({ port: Number(lines[0]), browserPath: lines[1] });
      }
      if (Date.now() - started > timeoutMs) return reject(new Error(`Timed out waiting for ${portFile}`));
      setTimeout(check, 100);
    };
    check();
  });
}
function processFamily(rootPid) {
  const p = spawnSync("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" });
  const rows = p.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    return m ? { pid: Number(m[1]), ppid: Number(m[2]), command: m[3] } : null;
  }).filter(Boolean);
  const ids = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (ids.has(row.ppid) && !ids.has(row.pid)) { ids.add(row.pid); changed = true; }
  }
  return { psReturncode: p.status, processes: rows.filter((row) => ids.has(row.pid)) };
}
async function unionPathBounds(nodes) {
  const boxes = nodes.map((node) => {
    const b = node.getBBox();
    const cs = getComputedStyle(node);
    const strokeWidth = cs.stroke !== "none" ? Number.parseFloat(cs.strokeWidth) || 0 : 0;
    const half = strokeWidth / 2;
    return { x: b.x-half, y: b.y-half, right: b.x+b.width+half, bottom: b.y+b.height+half, strokeWidth, stroke: cs.stroke };
  });
  return {
    x: Math.min(...boxes.map((b) => b.x)), y: Math.min(...boxes.map((b) => b.y)),
    right: Math.max(...boxes.map((b) => b.right)), bottom: Math.max(...boxes.map((b) => b.bottom)),
    strokeWidths: [...new Set(boxes.map((b) => b.strokeWidth))],
  };
}
async function auditRenderedPage() {
  return await page.evaluate(() => {
    const union = (boxes) => ({
      x: Math.min(...boxes.map((b) => b.x)), y: Math.min(...boxes.map((b) => b.y)),
      right: Math.max(...boxes.map((b) => b.x + b.width)), bottom: Math.max(...boxes.map((b) => b.y + b.height)),
    });
    const expanded = (node) => {
      const b = node.getBBox();
      const s = getComputedStyle(node);
      const stroke = s.stroke === "none" ? 0 : (Number.parseFloat(s.strokeWidth) || 0);
      const h = stroke / 2;
      return { x:b.x-h, y:b.y-h, width:b.width+stroke, height:b.height+stroke };
    };
    const fromBoxes = (boxes) => {
      const u = union(boxes);
      return { x:u.x, y:u.y, width:u.right-u.x, height:u.bottom-u.y, right:u.right, bottom:u.bottom };
    };
    const transform = (box, matrix) => {
      const pts = [
        [box.x,box.y],[box.x+box.width,box.y],
        [box.x,box.y+box.height],[box.x+box.width,box.y+box.height],
      ].map(([x,y]) => [matrix.a*x+matrix.c*y+matrix.e, matrix.b*x+matrix.d*y+matrix.f]);
      const xs=pts.map((p)=>p[0]), ys=pts.map((p)=>p[1]);
      return {x:Math.min(...xs), y:Math.min(...ys), width:Math.max(...xs)-Math.min(...xs), height:Math.max(...ys)-Math.min(...ys)};
    };
    const baseline = [...document.querySelectorAll("[data-original-side]")].map((mount) => {
      const art=mount.querySelector("svg");
      const box=fromBoxes([...art.querySelectorAll("path")].map(expanded));
      const scale=art.getBoundingClientRect().width/64;
      return {side:mount.dataset.originalSide, bodyBoundsViewBox:box, svgCssSize:{width:art.getBoundingClientRect().width,height:art.getBoundingClientRect().height}, bodyHeightCssPx:box.height*scale, strokeWidths:[...new Set([...art.querySelectorAll("path")].map((n)=>{const s=getComputedStyle(n);return s.stroke==="none"?0:Number.parseFloat(s.strokeWidth)||0;}))]};
    });
    const native=[...document.querySelectorAll("[data-pose-grid] svg")].map((art) => {
      const group=art.querySelector("[data-mossguard-body]");
      const pathNodes=[...group.querySelectorAll("path")];
      const local=fromBoxes(pathNodes.map(expanded));
      const m=group.transform.baseVal.consolidate()?.matrix || art.createSVGMatrix();
      const body=transform(local,m);
      const safe=art.dataset.safeBounds.split(/\s+/).map(Number);
      const scale=art.getBoundingClientRect().width/64;
      const fullParts=[];
      for (const child of [...art.children]) {
        if (child.tagName.toLowerCase()==="defs") continue;
        if (child.tagName.toLowerCase()==="g") {
          const b=fromBoxes([...child.querySelectorAll("path")].map(expanded));
          fullParts.push(transform(b, child.transform.baseVal.consolidate()?.matrix || art.createSVGMatrix()));
        } else {
          const b=expanded(child);
          fullParts.push({x:b.x,y:b.y,width:b.width,height:b.height});
        }
      }
      const full=fromBoxes(fullParts);
      const declared=art.dataset.soleAnchor.split(/\s+/).map(Number);
      const allIds=[...art.querySelectorAll("linearGradient[id]")].map((n)=>n.id);
      const refs=[...art.querySelectorAll("[fill]")].flatMap((n)=>[...n.getAttribute("fill").matchAll(/url\(#([^)]+)\)/g)].map((m)=>m[1]));
      const boundTolerance=1e-7;
      return {
        direction:art.dataset.direction, pose:art.dataset.pose, team:art.dataset.team, tick:Number(art.dataset.tick),
        svgCssSize:{width:art.getBoundingClientRect().width,height:art.getBoundingClientRect().height},
        scaleCssPxPerViewBoxUnit:scale,
        bodyBoundsViewBox:body,
        bodyBoundsLocalViewBox:local,
        bodyHeightCssPx:body.height*scale,
        soleAnchorDeclared:declared,
        measuredBodyBottomViewBox:body.y+body.height,
        safeBoundsViewBox:safe,
        bodyInsideSafeBounds:body.x>=safe[0]-boundTolerance && body.y>=safe[1]-boundTolerance && body.x+body.width<=safe[2]+boundTolerance && body.y+body.height<=safe[3]+boundTolerance,
        soleHeightMatchesAnchor:Math.abs((body.y+body.height)-declared[1])<=boundTolerance,
        allArtBoundsViewBox:full,
        visiblePathStrokeWidths:[...new Set(pathNodes.map((n)=>{const s=getComputedStyle(n);return s.stroke==="none"?0:Number.parseFloat(s.strokeWidth)||0;}))],
        gradientIds:allIds,
        gradientRefs:refs,
      };
    });
    const diagnostic=[...document.querySelectorAll("[data-diagnostic-grid] svg")].map((art)=>({direction:art.dataset.direction,pose:art.dataset.pose,team:art.dataset.team,widthCssPx:art.getBoundingClientRect().width,heightCssPx:art.getBoundingClientRect().height}));
    const allSvg=[...document.querySelectorAll("svg")];
    const allIds=allSvg.flatMap((svg)=>[...svg.querySelectorAll("[id]")].map((n)=>n.id));
    const idSet=new Set(allIds);
    const gradientRefs=allSvg.flatMap((svg)=>[...svg.querySelectorAll("[fill]")].flatMap((n)=>[...n.getAttribute("fill").matchAll(/url\(#([^)]+)\)/g)].map((m)=>({id:m[1],local:Boolean(svg.querySelector(`[id="${m[1]}"]`))}))));
    return {
      url:location.href, title:document.title,
      viewport:{innerWidth,innerHeight,devicePixelRatio,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight},
      displayedMeasurements:{baseline:document.querySelector("[data-baseline-measure]")?.textContent,rig:document.querySelector("[data-rig-measure]")?.textContent},
      baseline,
      native,
      diagnostic,
      instanceCounts:{svg:allSvg.length,native:native.length,diagnostic:diagnostic.length,gradientIds:native.flatMap((p)=>p.gradientIds).length+0},
      gradientAudit:{uniqueIds:allIds.length===idSet.size,gradientIds:[...document.querySelectorAll("linearGradient[id]")].map((n)=>n.id),allGradientIdsUnique:(()=>{const a=[...document.querySelectorAll("linearGradient[id]")].map((n)=>n.id);return a.length===new Set(a).size;})(),allGradientRefsLocal:gradientRefs.every((r)=>r.local),gradientRefCount:gradientRefs.length,nonLocalGradientRefs:gradientRefs.filter((r)=>!r.local)},
      aggregate:{allBodiesInsideSafeBounds:native.every((p)=>p.bodyInsideSafeBounds),allSolesMatchAnchor:native.every((p)=>p.soleHeightMatchesAnchor),minBodyHeightCssPx:Math.min(...native.map((p)=>p.bodyHeightCssPx)),maxBodyHeightCssPx:Math.max(...native.map((p)=>p.bodyHeightCssPx)),allNativeCells16CssPx:native.every((p)=>p.svgCssSize.width===16&&p.svgCssSize.height===16),directions:[...new Set(native.map((p)=>p.direction))],poses:[...new Set(native.map((p)=>p.pose))],teams:[...new Set(native.map((p)=>p.team))]},
    };
  });
}
function processFamily(rootPid) {
  const p = spawnSync("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" });
  const rows = p.stdout.split(/\r?\n/).filter(Boolean).map((line) => {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    return m ? { pid: Number(m[1]), ppid: Number(m[2]), command: m[3] } : null;
  }).filter(Boolean);
  const ids = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) if (ids.has(row.ppid) && !ids.has(row.pid)) { ids.add(row.pid); changed = true; }
  }
  return { psReturncode: p.status, processes: rows.filter((row) => ids.has(row.pid)) };
}
(async () => {
  const serverRequests=[];
  server=http.createServer((req,res)=>{
    const urlPath=decodeURIComponent(new URL(req.url,"http://localhost").pathname);
    const target=path.resolve(repo,"."+urlPath);
    if (!target.startsWith(repo+path.sep) && target!==repo) { res.statusCode=403;res.end("forbidden");return; }
    serverRequests.push({method:req.method,url:req.url});
    fs.readFile(target,(err,data)=>{
      if(err){res.statusCode=404;res.end(String(err));return;}
      const ext=path.extname(target);
      const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".json":"application/json; charset=utf-8",".svg":"image/svg+xml",".webp":"image/webp"};
      res.setHeader("content-type",types[ext]||"application/octet-stream");
      res.end(data);
    });
  });
  await new Promise((resolve,reject)=>server.listen(0,"127.0.0.1",(e)=>e?reject(e):resolve()));
  const serverPort=server.address().port;
  capture.commands.chrome={executable:chromePath,args:["--headless=new","--remote-debugging-port=0",`--user-data-dir=${profile}`],cwd:repo};
  chromeProcess=spawn(chromePath,["--headless=new","--remote-debugging-port=0",`--user-data-dir=${profile}`],{cwd:repo,stdio:["ignore","pipe","pipe"]});
  chromeProcess.stdout.on("data",(d)=>{chromeStdout+=d.toString();});
  chromeProcess.stderr.on("data",(d)=>{chromeStderr+=d.toString();});
  const activePort=await waitForDevtools(path.join(profile,"DevToolsActivePort"),20000);
  capture.chromeDevtools={port:activePort.port,browserPath:activePort.browserPath};
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${activePort.port}`);
  capture.browserVersion=browser.version();
  const context=browser.contexts()[0];
  const versionPage=await context.newPage();
  await versionPage.goto("chrome://version/",{waitUntil:"domcontentloaded",timeout:15000});
  capture.chromeVersionPage=await versionPage.evaluate(()=>({version:document.querySelector("#version")?.textContent?.trim()||document.body.innerText.match(/Google Chrome\s+([^\n]+)/)?.[1]||null,executable:document.querySelector("#executable_path")?.textContent?.trim()||null,commandLine:document.querySelector("#command_line")?.textContent?.trim()||null,os:document.querySelector("#os_type")?.textContent?.trim()||null}));
  await versionPage.close();
  const procFamily=processFamily(chromeProcess.pid);
  capture.chromeProcessFamily=procFamily;
  const allCommands=[capture.chromeVersionPage.commandLine||"",...procFamily.processes.map((x)=>x.command)];
  const forbidden=["--enable-unsafe-swiftshader","--disable-gpu","--use-angle","--use-gl"];
  capture.gpuFlagAudit={forbiddenFlags:forbidden,found:forbidden.flatMap((flag)=>allCommands.filter((line)=>line.includes(flag)).map((line)=>({flag,line}))),strictZeroGpuFlagsProven:false};
  capture.gpuFlagAudit.strictZeroGpuFlagsProven=capture.gpuFlagAudit.found.length===0 && Boolean(capture.chromeVersionPage.commandLine);
  page=await context.newPage();
  await page.setViewportSize({width:1440,height:1200});
  page.on("console",(msg)=>{if(msg.type()==="error")capture.consoleErrors.push(msg.text());});
  page.on("pageerror",(err)=>capture.pageErrors.push(String(err)));
  page.on("requestfailed",(req)=>capture.requestFailures.push({url:req.url(),failure:req.failure()?.errorText}));
  page.on("request",(req)=>capture.requests.push({url:req.url(),method:req.method()}));
  for (const view of ["before","after","compare"]) {
    const url=`http://127.0.0.1:${serverPort}/demo/mossguard-vector-rig.html?view=${view}`;
    await page.goto(url,{waitUntil:"load",timeout:20000});
    await page.waitForFunction(()=>document.documentElement.dataset.rigMetrics && document.querySelectorAll("[data-pose-grid] svg").length===16,{timeout:10000});
    const name=view==="compare"?"comparison":view;
    const file=screenshotFiles[name];
    const bytes=await page.screenshot({path:path.join(output,file),fullPage:true,animations:"disabled"});
    capture.screenshots[name]={path:file,...pngDimensions(Buffer.from(bytes)),sha256:require("node:crypto").createHash("sha256").update(bytes).digest("hex")};
    if (view==="compare") {
      capture.audit=await auditRenderedPage();
      const diagnostic=await page.locator("[data-section=diagnostic]").screenshot({path:path.join(output,screenshotFiles.diagnostic),animations:"disabled"});
      capture.screenshots.diagnostic={path:screenshotFiles.diagnostic,...pngDimensions(Buffer.from(diagnostic)),sha256:require("node:crypto").createHash("sha256").update(diagnostic).digest("hex"),classification:"enlarged diagnostic only; not native-scale evidence"};
    }
  }
  capture.server={host:"127.0.0.1",port:serverPort,requests:serverRequests,onlyLocalAssets:true};
  capture.pageRuntime={pageErrors:capture.pageErrors,consoleErrors:capture.consoleErrors,requestFailures:capture.requestFailures,requests:capture.requests};
  capture.completed=true;
})().catch((err)=>{
  capture.completed=false;
  capture.failure={name:err.name,message:err.message,stack:err.stack};
}).finally(async()=>{
  if(page){try{await page.close();}catch{}}
  if(browser){try{await browser.close();}catch{}}
  if(server){try{await new Promise((resolve)=>server.close(()=>resolve()));}catch{}}
  if(chromeProcess){
    if(chromeProcess.exitCode===null){try{chromeProcess.kill("SIGTERM");}catch{}}
    await new Promise((resolve)=>{if(chromeProcess.exitCode!==null)return resolve();const t=setTimeout(()=>{try{chromeProcess.kill("SIGKILL");}catch{}resolve();},3000);chromeProcess.once("close",()=>{clearTimeout(t);resolve();});});
    capture.chromeExit={exitCode:chromeProcess.exitCode,signal:chromeProcess.signalCode};
  }
  saveText("chrome-process.stdout.txt",chromeStdout);
  saveText("chrome-process.stderr.txt",chromeStderr);
  saveText("chrome-commandline.txt",capture.chromeVersionPage?.commandLine||"<not captured>\n");
  saveText("chrome-process-family.json",JSON.stringify(capture.chromeProcessFamily||null,null,2)+"\n");
  saveText("browser-evidence.json",JSON.stringify(capture,null,2)+"\n");
  process.stdout.write(JSON.stringify({completed:capture.completed,failure:capture.failure||null,chromeVersion:capture.chromeVersionPage?.version||null,playwrightVersion:capture.playwrightVersion,strictZeroGpuFlagsProven:capture.gpuFlagAudit?.strictZeroGpuFlagsProven??false,screenshots:capture.screenshots||{},audit:capture.audit?{bodyCount:capture.audit.native.length,aggregate:capture.audit.aggregate,baseline:capture.audit.baseline,gradientAudit:capture.audit.gradientAudit}:null,pageErrors:capture.pageErrors,consoleErrors:capture.consoleErrors,requestFailures:capture.requestFailures},null,2)+"\n");
  if(!capture.completed || !capture.gpuFlagAudit?.strictZeroGpuFlagsProven) process.exitCode=1;
});
