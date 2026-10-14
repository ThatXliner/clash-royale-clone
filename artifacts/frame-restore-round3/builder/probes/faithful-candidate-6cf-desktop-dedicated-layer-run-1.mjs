import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { once } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";

const ROOT = "/private/tmp/frame-restore-round3-builder";
const OUTPUT = resolve(ROOT, "artifacts/frame-restore-round3/builder/desktop-1440-dedicated-layer-run-1");
const CHROME = process.env.GAME_BROWSER_CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VIEWPORT = { width: 1440, height: 933 };
const DECK = ["skymaul", "brassbolt", "reedsting", "briar-band", "cinderlings", "coilblade", "mossguard", "copperskiff"];
const MIME = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml" };
mkdirSync(OUTPUT, { recursive: true });
writeFileSync(resolve(OUTPUT, "runner-pid.txt"), `${process.pid}\n`);
const terminal = [];
const originalLog = console.log.bind(console);
const originalError = console.error.bind(console);
console.log = (...args) => { const line = args.map(String).join(" "); terminal.push(line); originalLog(...args); };
console.error = (...args) => { const line = args.map(String).join(" "); terminal.push(line); originalError(...args); };
process.on("exit", () => {
  writeFileSync(resolve(OUTPUT, "runner-output.txt"), `${terminal.join("\n")}\n`);
  writeFileSync(resolve(OUTPUT, "runner-exit.json"), `${JSON.stringify({ pid: process.pid, exitCode: process.exitCode ?? 0, viewport: VIEWPORT }, null, 2)}\n`);
});

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

async function stateSnapshot(page, child, label) {
  const outer = await page.evaluate((phase) => {
    const selectors = { shell: ".app-shell", header: ".app-header", main: ".app-main", view: "#view-battle", heading: ".battle-heading", slot: "[data-battle-frame-slot]", frame: "[data-battle-frame-slot] iframe", nav: ".app-nav" };
    const describe = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect(), style = getComputedStyle(node);
      return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left }, style: { display: style.display, position: style.position, boxSizing: style.boxSizing, padding: style.padding, height: style.height, minHeight: style.minHeight, flex: style.flex, transform: style.transform, transitionProperty: style.transitionProperty, transitionDuration: style.transitionDuration, animationName: style.animationName } };
    };
    return { phase, viewport: { innerWidth, innerHeight, dpr: devicePixelRatio, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches }, activeView: document.querySelector(".app-shell")?.dataset.viewActive ?? null, nodes: Object.fromEntries(Object.entries(selectors).map(([key, selector]) => [key, describe(document.querySelector(selector))])) };
  }, label);
  const inner = await child.evaluate((phase) => {
    const c = globalThis.__spriteRendererProbe;
    const identityState = window.__frameRestore001DesktopNodeIds ??= { next: 1, ids: new WeakMap() };
    const id = (node) => { if (!node) return null; if (!identityState.ids.has(node)) identityState.ids.set(node, identityState.next++); return identityState.ids.get(node); };
    const rect = (node) => { if (!node) return null; const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, right: r.right, bottom: r.bottom, left: r.left }; };
    const style = (node) => { if (!node) return null; const s = getComputedStyle(node); return { display: s.display, position: s.position, boxSizing: s.boxSizing, width: s.width, height: s.height, padding: s.padding, margin: s.margin, border: s.border, background: s.background, color: s.color, font: s.font, transform: s.transform, transition: s.transition, animation: s.animation, willChange: s.willChange, contain: s.contain, isolation: s.isolation, boxShadow: s.boxShadow, borderRadius: s.borderRadius }; };
    const describe = (node) => ({ identity: id(node), parentIdentity: id(node.parentElement), tag: node.tagName, className: typeof node.className === "string" ? node.className : null, dataset: { ...node.dataset }, rect: rect(node), style: style(node), html: node.outerHTML });
    const arena = document.querySelector('[data-ui="arena"]');
    const shell = document.querySelector('[data-ui="arena-shell"]');
    const hud = document.querySelector(".game-browser-layer--hud");
    const cards = [...document.querySelectorAll('.hud-card[data-slot]')];
    const controls = [...document.querySelectorAll("input,select,textarea,button")].map((node) => ({ tag: node.tagName, ui: node.dataset.ui ?? null, value: "value" in node ? node.value : null, checked: "checked" in node ? node.checked : null, pressed: node.getAttribute("aria-pressed"), disabled: node.disabled, text: node.textContent?.trim() ?? "", focus: node === document.activeElement, hover: node.matches(":hover") }));
    const safe = (value) => { try { return JSON.stringify(value) ?? "undefined"; } catch (error) { return `!serialization-error:${error}`; } };
    const audioPolicy = { gainBasisPoints: c.audio?.gainBasisPoints ?? null, muted: c.audio?.muted ?? null };
    return {
      phase, sessionTick: c.state.sessionTick, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      viewport: { innerWidth, innerHeight, dpr: devicePixelRatio },
      geometry: { document: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }, shell: describe(shell), arena: describe(arena), hud: describe(hud), cards: cards.map(describe) },
      sessionBytes: c.session.serialize(), browserSnapshot: c.serialize(), controllerState: safe(c.state),
      audioState: safe(c.audio), audioPolicy, audioDiagnostics: safe(c.audioDiagnostics), audioMixAudit: safe(c.audioMixAudit),
      audioContinuationBytes: typeof c.audioContinuationBytes === "string" ? c.audioContinuationBytes : safe(c.audioContinuationBytes),
      audioPcmObservations: safe(c.audioPcmObservations), inputDom: safe(controls), controls,
      activeElement: document.activeElement ? { tag: document.activeElement.tagName, id: document.activeElement.id, className: typeof document.activeElement.className === "string" ? document.activeElement.className : null } : null,
      fonts: safe({ status: document.fonts.status, faces: [...document.fonts].map((face) => ({ family: face.family, style: face.style, weight: face.weight, status: face.status })) }),
      resources: safe(performance.getEntriesByType("resource").map(({ name, initiatorType, transferSize, encodedBodySize, decodedBodySize, responseEnd }) => ({ name, initiatorType, transferSize, encodedBodySize, decodedBodySize, responseEnd }))),
    };
  }, label);
  const fingerprints = Object.fromEntries(["sessionBytes", "browserSnapshot", "controllerState", "audioState", "audioDiagnostics", "audioMixAudit", "audioContinuationBytes", "audioPcmObservations", "inputDom", "fonts", "resources"].map((key) => [key, { bytes: Buffer.byteLength(inner[key]), sha256: createHash("sha256").update(inner[key]).digest("hex") }]));
  return { outer, inner, fingerprints };
}

async function capture(page, child, label, evidence) {
  await Promise.all([page.evaluate(() => document.fonts.ready), child.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined))); })]);
  await waitForPaintFrames(page, child);
  const state = await stateSnapshot(page, child, label);
  const png = await page.screenshot();
  const filename = `${label}.png`;
  writeFileSync(resolve(OUTPUT, filename), png);
  evidence.captures[label] = { filename, bytes: png.length, sha256: createHash("sha256").update(png).digest("hex"), state };
  return png;
}

async function decodedDiff(page, before, after) {
  return page.evaluate(async ({ a, b }) => {
    const decode = async (base64) => { const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode(); const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; const context = canvas.getContext("2d", { willReadFrequently: true }); context.drawImage(image, 0, 0); return { width: canvas.width, height: canvas.height, pixels: context.getImageData(0, 0, canvas.width, canvas.height).data }; };
    const left = await decode(a), right = await decode(b); let count = 0, maximum = 0, minX = Infinity, minY = Infinity, maxX = -1, maxY = -1; const first = [];
    for (let index = 0; index < left.pixels.length; index += 4) { let delta = 0; for (let channel = 0; channel < 4; channel += 1) delta = Math.max(delta, Math.abs(left.pixels[index + channel] - right.pixels[index + channel])); if (delta === 0) continue; const pixel = index / 4, x = pixel % left.width, y = Math.floor(pixel / left.width); count += 1; maximum = Math.max(maximum, delta); minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); if (first.length < 24) first.push({ x, y, before: [...left.pixels.slice(index, index + 4)], after: [...right.pixels.slice(index, index + 4)], maximumChannelDelta: delta }); }
    return { dimensionsBefore: [left.width, left.height], dimensionsAfter: [right.width, right.height], differingPixelCount: count, maximumChannelDelta: maximum, boundingBox: count ? { minX, minY, maxX, maxY } : null, firstDifferingPixels: first };
  }, { a: before.toString("base64"), b: after.toString("base64") });
}

function summarizePair(before, after, beforePng, afterPng, pixelDiff) {
  const fields = ["sessionBytes", "browserSnapshot", "controllerState", "inputDom", "audioContinuationBytes", "fonts", "resources"];
  const exact = Object.fromEntries(fields.map((key) => [key, before.inner[key] === after.inner[key]]));
  exact.audioPolicy = JSON.stringify(before.inner.audioPolicy) === JSON.stringify(after.inner.audioPolicy);
  exact.geometry = JSON.stringify({ outer: before.outer.nodes, inner: before.inner.geometry }) === JSON.stringify({ outer: after.outer.nodes, inner: after.inner.geometry });
  exact.fullViewportPng = beforePng.equals(afterPng);
  exact.decodedPixels = pixelDiff.differingPixelCount === 0;
  return { exact, pixelDiff, beforeFingerprint: before.fingerprints, afterFingerprint: after.fingerprints, historicalAudio: { before: { state: before.inner.audioState, diagnostics: before.inner.audioDiagnostics, mixAudit: before.inner.audioMixAudit, pcm: before.inner.audioPcmObservations }, after: { state: after.inner.audioState, diagnostics: after.inner.audioDiagnostics, mixAudit: after.inner.audioMixAudit, pcm: after.inner.audioPcmObservations } } };
}

function frameForUrl(tree, fragment) {
  if (tree.frame.url?.includes(fragment)) return tree.frame;
  for (const child of tree.childFrames ?? []) {
    const found = frameForUrl(child, fragment);
    if (found) return found;
  }
  return null;
}

async function createCausalInspector(page, child) {
  const cdp = await page.context().newCDPSession(page);
  const contexts = [];
  let latestLayers = [];
  let layerEvents = 0;
  cdp.on("Runtime.executionContextCreated", ({ context }) => contexts.push(context));
  cdp.on("LayerTree.layerTreeDidChange", ({ layers }) => {
    latestLayers = layers ?? [];
    layerEvents += 1;
  });
  await cdp.send("Page.enable");
  await cdp.send("DOM.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("LayerTree.enable");
  const frameTree = await cdp.send("Page.getFrameTree");
  const frame = frameForUrl(frameTree.frameTree, "app-frame=1");
  assert.ok(frame, "CDP must expose the mounted app iframe in the page target");
  const context = contexts.find((candidate) => candidate.auxData?.frameId === frame.id && candidate.auxData?.isDefault !== false);
  assert.ok(context, "CDP must expose the default execution context for the app iframe");
  return {
    cdp,
    frameId: frame.id,
    contextId: context.id,
    layerSummary: () => ({ eventCount: layerEvents, layerCount: latestLayers.length, layers: latestLayers }),
    async describe(selector) {
      const expression = `document.querySelector(${JSON.stringify(selector)})`;
      const evaluated = await cdp.send("Runtime.evaluate", { expression, contextId: context.id, returnByValue: false });
      if (evaluated.exceptionDetails) throw new Error(`CDP query failed for ${selector}: ${evaluated.exceptionDetails.text}`);
      if (!evaluated.result.objectId) return { selector, found: false };
      try {
        const described = await cdp.send("DOM.describeNode", { objectId: evaluated.result.objectId, depth: 1, pierce: true });
        const parent = await cdp.send("Runtime.evaluate", {
          expression: `document.querySelector(${JSON.stringify(selector)})?.parentElement`,
          contextId: context.id,
          returnByValue: false,
        });
        let parentNode = null;
        if (parent.result.objectId) {
          try { parentNode = (await cdp.send("DOM.describeNode", { objectId: parent.result.objectId, depth: 0 })).node; }
          finally { await cdp.send("Runtime.releaseObject", { objectId: parent.result.objectId }).catch(() => {}); }
        }
        return {
          selector,
          found: true,
          backendNodeId: described.node.backendNodeId,
          nodeId: described.node.nodeId,
          nodeName: described.node.nodeName,
          attributes: described.node.attributes,
          parentBackendNodeId: parentNode?.backendNodeId ?? null,
          parentNodeName: parentNode?.nodeName ?? null,
          childNodes: (described.node.children ?? []).map((node) => ({ backendNodeId: node.backendNodeId, nodeName: node.nodeName, attributes: node.attributes })),
        };
      } finally {
        await cdp.send("Runtime.releaseObject", { objectId: evaluated.result.objectId }).catch(() => {});
      }
    },
    async layerMatches(targets) {
      const matches = [];
      for (const target of targets) {
        if (!target.backendNodeId) continue;
        for (const layer of latestLayers) {
          if (layer.backendNodeId !== target.backendNodeId) continue;
          let reasons = null;
          try { reasons = (await cdp.send("LayerTree.compositingReasons", { layerId: layer.layerId })).compositingReasons; }
          catch (error) { reasons = [`unavailable: ${String(error)}`]; }
          matches.push({ selector: target.selector, backendNodeId: target.backendNodeId, layerId: layer.layerId, parentLayerId: layer.parentLayerId ?? null, offsetX: layer.offsetX, offsetY: layer.offsetY, width: layer.width, height: layer.height, drawsContent: layer.drawsContent, paintCount: layer.paintCount, reasons });
        }
      }
      return { eventCount: layerEvents, layerCount: latestLayers.length, matches };
    },
    close: () => cdp.detach(),
  };
}

async function installMeterMutationTrace(child) {
  return child.evaluate(() => {
    const identityState = window.__frameRestore001DesktopNodeIds ??= { next: 1, ids: new WeakMap() };
    const id = (node) => { if (!node) return null; if (!identityState.ids.has(node)) identityState.ids.set(node, identityState.next++); return identityState.ids.get(node); };
    const selectors = ".hud-resource-progress,.elixir-rail,.elixir-fill,.elixir-ticks,.elixir-ticks i,[data-ui='hud-elixir'],.game-ui-hud-frame,.game-browser-layer--hud";
    const describe = (node) => {
      if (!node) return null;
      if (node.nodeType === Node.TEXT_NODE) return { identity: id(node), nodeType: "text", value: node.data.slice(0, 80), parentIdentity: id(node.parentElement) };
      return { identity: id(node), nodeType: node.nodeName, className: typeof node.className === "string" ? node.className : null, dataset: { ...(node.dataset ?? {}) }, parentIdentity: id(node.parentElement) };
    };
    const relevant = (node) => {
      const element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
      return Boolean(element && (element.matches(selectors) || element.closest(selectors)));
    };
    const relevantDescendants = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) return [];
      const found = [];
      if (node.matches(selectors)) found.push(node);
      found.push(...node.querySelectorAll(selectors));
      return found.slice(0, 24).map(describe);
    };
    let phase = "checkpoint-171";
    const records = [];
    const record = (mutation) => {
      const addedNodes = [...mutation.addedNodes];
      const removedNodes = [...mutation.removedNodes];
      const nodeRelevant = relevant(mutation.target) || addedNodes.some((node) => relevant(node) || relevantDescendants(node).length) || removedNodes.some((node) => relevant(node) || relevantDescendants(node).length);
      if (!nodeRelevant) return;
      records.push({
        phase,
        type: mutation.type,
        target: describe(mutation.target),
        attributeName: mutation.attributeName ?? null,
        oldValue: mutation.oldValue,
        currentValue: mutation.type === "attributes" ? mutation.target.getAttribute(mutation.attributeName) : mutation.type === "characterData" ? mutation.target.data : null,
        added: addedNodes.map((node) => ({ ...describe(node), relevantDescendants: relevantDescendants(node) })),
        removed: removedNodes.map((node) => ({ ...describe(node), relevantDescendants: relevantDescendants(node) })),
      });
    };
    const observer = new MutationObserver((mutations) => mutations.forEach(record));
    observer.observe(document.documentElement, { subtree: true, attributes: true, attributeOldValue: true, childList: true, characterData: true, characterDataOldValue: true });
    const drain = () => {
      observer.takeRecords().forEach(record);
      return records.splice(0);
    };
    window.__frameRestore001MeterMutationTrace = { setPhase(value) { phase = value; }, drain, disconnect() { observer.disconnect(); } };
    return { installed: true, phase };
  });
}

async function captureMeterTrace(child, inspector, label, viewportPoints) {
  const dom = await child.evaluate(({ label: phase, viewportPoints: points }) => {
    const identityState = window.__frameRestore001DesktopNodeIds ??= { next: 1, ids: new WeakMap() };
    const id = (node) => { if (!node) return null; if (!identityState.ids.has(node)) identityState.ids.set(node, identityState.next++); return identityState.ids.get(node); };
    const rect = (node) => { const r = node.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, right: r.right, bottom: r.bottom, left: r.left }; };
    const computed = (node) => {
      const style = getComputedStyle(node);
      return Object.fromEntries(["display", "position", "zIndex", "left", "top", "width", "height", "transform", "clipPath", "pointerEvents", "opacity", "willChange", "contain", "isolation", "background", "backgroundColor", "border", "borderRadius", "boxShadow", "overflow"].map((key) => [key, style[key]]));
    };
    const describe = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return { selector, found: false };
      const ancestry = [];
      for (let current = node, depth = 0; current && depth < 6; current = current.parentElement, depth += 1) ancestry.push({ identity: id(current), tag: current.tagName, className: typeof current.className === "string" ? current.className : null, parentIdentity: id(current.parentElement) });
      return { selector, found: true, identity: id(node), parentIdentity: id(node.parentElement), tag: node.tagName, className: typeof node.className === "string" ? node.className : null, dataset: { ...node.dataset }, inlineStyle: node.getAttribute("style"), rect: rect(node), computed: computed(node), ancestry, outerHTML: node.outerHTML.slice(0, 1200) };
    };
    const frameElement = window.frameElement;
    const frameRect = frameElement?.getBoundingClientRect();
    const scale = frameRect ? { x: frameRect.width / innerWidth, y: frameRect.height / innerHeight } : null;
    const selectors = [".game-browser-layer--hud", ".game-ui-hud-frame", '[data-ui="hud-elixir"]', ".hud-resource-progress", '[data-ui="elixir-rail"]', ".elixir-fill", ".elixir-ticks", ".elixir-ticks i", '[data-ui="elixir-rail"] output'];
    const nodes = Object.fromEntries(selectors.map((selector) => [selector, describe(selector)]));
    const paintStacks = points.map((point) => {
      const x = scale && frameRect ? (point.x - frameRect.x) / scale.x : NaN;
      const y = scale && frameRect ? (point.y - frameRect.y) / scale.y : NaN;
      const stack = Number.isFinite(x + y) ? document.elementsFromPoint(x, y) : [];
      return { viewport: point, childPoint: { x, y }, stack: stack.slice(0, 8).map((node) => ({ identity: id(node), tag: node.tagName, className: typeof node.className === "string" ? node.className : null, dataset: { ...node.dataset }, parentIdentity: id(node.parentElement), rect: rect(node), computed: computed(node) })) };
    });
    const controller = globalThis.__spriteRendererProbe;
    return { phase, sessionTick: controller.state.sessionTick, viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, frameRect: frameRect ? { x: frameRect.x, y: frameRect.y, width: frameRect.width, height: frameRect.height } : null, childToViewportScale: scale, nodes, paintStacks };
  }, { label, viewportPoints });
  const selectors = Object.keys(dom.nodes);
  const backend = [];
  for (const selector of selectors) backend.push(await inspector.describe(selector));
  const layers = await inspector.layerMatches(backend);
  const mutations = await child.evaluate(() => window.__frameRestore001MeterMutationTrace?.drain() ?? []);
  return { dom, backend, layers, mutations };
}

async function main() {
  const repoCommit = execFileSync("git", ["-C", ROOT, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  assert.equal(repoCommit, "6cf983c6101e57de1d3b803c7e5469809b60ace4");
  const candidateSourceSha256 = {};
  for (const file of ["src/ui/game-ui-projection.js", "src/ui/game-browser-loop.js", "src/ui/hud-motion.js", "tests/game-ui-projection.test.js", "tests/game-browser-loop.test.js"]) candidateSourceSha256[file] = createHash("sha256").update(await readFile(resolve(ROOT, file))).digest("hex");
  assert.deepEqual(candidateSourceSha256, {
    "src/ui/game-ui-projection.js": "129b07f9f68924b6095fc26001eeb86265254cdb40acc577f418ec2daed7e6ba",
    "src/ui/game-browser-loop.js": "f84c5f1b6928241c0c91b5c6b9501626be414b6e41a045334cb7ee0c8990c7c5",
    "src/ui/hud-motion.js": "f7e3593a1a1a72021ef1ee2921613fef9345b5918ae2026098db3da4d332a22c",
    "tests/game-ui-projection.test.js": "ace83cb0473d20cad67eaeb9ae3b22452c014d9c14627ce337e6c92547aa9d35",
    "tests/game-browser-loop.test.js": "4e037881bf066c848185e721a409e981cd3027b1ac87e1c62133a33287702234",
  }, "desktop matrix must use the exact source frozen by the phone proof");
  const evidence = { diagnostic: "FRAME-RESTORE-001 frozen-6cf desktop dedicated-layer causal intervention", startedAt: new Date().toISOString(), pid: process.pid, repoCommit, viewport: { ...VIEWPORT, deviceScaleFactor: 1 }, candidateSourceSha256, captures: {}, restores: [], errors: { page: [], console: [] } };
  const { server, missingPaths, url } = await startStaticServer();
  let browser;
  let inspector;
  try {
    browser = await chromium.launch({ executablePath: existsSync(CHROME) ? CHROME : undefined, headless: true });
    evidence.browser = { version: browser.version(), playwright: JSON.parse(await readFile(resolve(ROOT, "node_modules/playwright/package.json"), "utf8")).version };
    const page = await browser.newPage({ deviceScaleFactor: 1, viewport: VIEWPORT });
    page.on("pageerror", (error) => evidence.errors.page.push(String(error)));
    page.on("console", (message) => { if (message.type() === "error") evidence.errors.console.push(message.text()); });
    const response = await page.goto(`${url}/public/index.html`, { waitUntil: "networkidle" });
    assert.equal(response.status(), 200);
    await page.locator('.app-nav [data-nav-to="battle"]').click();
    const frameElement = page.locator("[data-battle-frame-slot] iframe");
    await frameElement.waitFor({ state: "attached" });
    const frame = frameElement.contentFrame();
    await frame.locator('[data-ui="arena"]').waitFor({ state: "visible", timeout: 8_000 });
    const child = page.frames().find((candidate) => candidate.url().includes("app-frame=1"));
    assert.ok(child);
    inspector = await createCausalInspector(page, child);
    evidence.causalTrace = {
      frameId: inspector.frameId,
      contextId: inspector.contextId,
      sampleViewportPoints: [
        { label: "left-edge", x: 576, y: 901 },
        { label: "right-edge", x: 810, y: 907 },
        { label: "top-edge-a", x: 692, y: 898 },
        { label: "top-edge-b", x: 754, y: 898 },
      ],
      install: null,
    };
    evidence.boot = await child.evaluate(async (deck) => {
      const { arenaHudController: controller } = await import("/src/ui/arena-shell-entry.js");
      globalThis.__spriteRendererProbe = controller;
      const wasRunning = !controller.state.paused;
      if (wasRunning) controller.pause();
      controller.replaceDeck(deck);
      const resumed = controller.state.paused ? controller.resume() : false;
      const manual = controller.enterManualStepMode();
      return { deck: JSON.parse(controller.session.serialize()).setup.deck, manual, pausedBeforeSetup: !wasRunning, running: !controller.state.paused, resumed };
    }, DECK);
    assert.deepEqual(evidence.boot.deck, DECK);
    assert.equal(evidence.boot.pausedBeforeSetup, false);
    assert.equal(evidence.boot.manual, true);
    assert.equal(evidence.boot.running, true);
    evidence.causalTrace.install = await installMeterMutationTrace(child);

    const card = frame.locator('[data-ui="card-slot"][data-card-id="briar-band"]');
    await card.waitFor();
    await card.click();
    const arena = frame.locator('[data-ui="arena"]');
    const arenaBox = await arena.boundingBox();
    assert.ok(arenaBox && arenaBox.width > 0 && arenaBox.height > 0);
    await page.mouse.click(arenaBox.x + arenaBox.width / 2, arenaBox.y + arenaBox.height * 0.54);
    evidence.contact = await child.evaluate(() => {
      const controller = globalThis.__spriteRendererProbe;
      for (let index = 0; index < 600; index += 1) {
        const before = controller.session.state;
        const events = controller.stepMany(1);
        const state = controller.session.state;
        const units = new Map(before.battle.units.map((unit) => [unit.id, unit]));
        const attack = events.find((event) => event.type === "attack" && units.get(event.attackerId)?.archetypeId === "briar-runner" && units.get(event.attackerId)?.side === "south");
        if (!attack) continue;
        const source = state.battle.units.find((unit) => unit.id === attack.attackerId);
        if (!source) continue;
        const damage = events.find((event) => event.type === "damage" && event.attackerId === attack.attackerId && event.targetId === attack.targetId && event.delivery === "melee" && event.tick === attack.tick);
        if (!damage) continue;
        const marker = [...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')].find((node) => node.dataset.combatId === String(attack.attackerId));
        const art = marker?.querySelector(".combat-art");
        return { attack: { attackerId: attack.attackerId, sequence: attack.sequence, targetId: attack.targetId, tick: attack.tick, type: attack.type }, damage: { amount: damage.amount, currentHealthBefore: damage.currentHealthBefore, currentHealthAfter: damage.currentHealthAfter, delivery: damage.delivery }, frame: art ? { action: art.dataset.spriteAction ?? null, attackAge: art.dataset.attackAnimationAge ?? null, pose: marker?.dataset.pose ?? null, tick: Number(art.dataset.simulationTick) } : null, sessionTick: state.tick, state: { targetId: source.attack.targetId, phase: source.attack.phase, nextTick: source.attack.nextTick, nextAttackTick: source.attack.nextAttackTick, hitpoints: source.hitpoints, alive: source.alive } };
      }
      return null;
    });
    assert.ok(evidence.contact);
    assert.equal(evidence.contact.attack.tick, 170);
    assert.equal(evidence.contact.sessionTick, 171);
    assert.equal(evidence.contact.damage.delivery, "melee");
    assert.equal(evidence.contact.frame.action, "walk");
    assert.equal(evidence.contact.frame.pose, "attack");
    const outerGeometry = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, slot: (() => { const r = document.querySelector("[data-battle-frame-slot]").getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })(), frame: (() => { const n = document.querySelector("[data-battle-frame-slot] iframe"), r = n.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })() }));
    evidence.naturalGeometry = outerGeometry;
    assert.equal(outerGeometry.width, VIEWPORT.width);
    assert.equal(outerGeometry.height, VIEWPORT.height);
    assert.ok(outerGeometry.slot.width > 0 && outerGeometry.slot.height > 0 && outerGeometry.frame.width > 0 && outerGeometry.frame.height > 0);
    evidence.checkpoint = await child.evaluate(() => ({ sessionBytes: globalThis.__spriteRendererProbe.serialize(), contactHtml: document.querySelector('[data-game-browser-layer="combat"]').innerHTML, tick: globalThis.__spriteRendererProbe.state.sessionTick }));
    assert.equal(evidence.checkpoint.tick, 171);
    evidence.restores.push({ label: "normal-restore-179-to-171", fromTick: 179, toTick: 171 });
    evidence.captures["normal-before"] = {};
    const normalBeforePng = await capture(page, child, "normal-before", evidence);
    evidence.normalBeforeState = evidence.captures["normal-before"].state;
    evidence.causalTrace.checkpoint171 = await captureMeterTrace(child, inspector, "checkpoint-171-before-advance", evidence.causalTrace.sampleViewportPoints);
    await child.evaluate(() => window.__frameRestore001MeterMutationTrace.setPhase("advance-171-to-179"));
    const later = await child.evaluate(() => {
      const controller = globalThis.__spriteRendererProbe;
      controller.stepMany(2);
      controller.stepMany(6);
      return { tick: controller.state.sessionTick, targetId: controller.session.state.battle.units.find((unit) => unit.id === 1)?.attack.targetId };
    });
    assert.equal(later.tick, 179);
    evidence.causalTrace.advance171to179 = await captureMeterTrace(child, inspector, "tick-179-before-restore", evidence.causalTrace.sampleViewportPoints);
    await child.evaluate(() => window.__frameRestore001MeterMutationTrace.setPhase("restore-179-to-171"));
    const normalBeforeRestoreState = await stateSnapshot(page, child, "normal-before-restore-tick-179");
    evidence.normalBeforeRestoreState = normalBeforeRestoreState;
    evidence.restores[0].fromTick = later.tick;
    evidence.restores[0].hudBefore = await child.evaluate(() => ({ identity: (() => { const n = document.querySelector(".game-ui-hud-frame"); return n; })()?.dataset.tick ?? null, cardIds: [...document.querySelectorAll(".hud-card[data-slot]")].map((node) => node.dataset.cardId) }));
    const normalRestoreResult = await child.evaluate(({ bytes, expectedCombat }) => {
      const controller = globalThis.__spriteRendererProbe;
      controller.restore(bytes);
      controller.enterManualStepMode();
      return { tick: controller.state.sessionTick, combatIdentical: expectedCombat === document.querySelector('[data-game-browser-layer="combat"]').innerHTML };
    }, { bytes: evidence.checkpoint.sessionBytes, expectedCombat: evidence.checkpoint.contactHtml });
    assert.deepEqual(normalRestoreResult, { tick: 171, combatIdentical: true });
    evidence.restores[0].result = normalRestoreResult;
    evidence.causalTrace.restored171 = await captureMeterTrace(child, inspector, "tick-171-after-restore", evidence.causalTrace.sampleViewportPoints);
    const normalAfterPng = await capture(page, child, "normal-after", evidence);
    const normalAfterState = evidence.captures["normal-after"].state;
    const normalPixelDiff = await decodedDiff(page, normalBeforePng, normalAfterPng);
    evidence.normal = summarizePair(evidence.normalBeforeState, normalAfterState, normalBeforePng, normalAfterPng, normalPixelDiff);
    evidence.normal.geometryAtCheckpoint = evidence.normalBeforeState.outer.nodes;
    evidence.normal.geometryAfterRestore = normalAfterState.outer.nodes;
    evidence.normal.restoreAuditAtCheckpoint = evidence.normalBeforeState.inner;
    evidence.normal.restoreAuditAfter = normalAfterState.inner;
    const cssDelta = ".hud-resource-progress{transform:translateZ(0)!important}";
    evidence.intervention = {
      cssDelta,
      sourceFile: "src/ui/hud-motion.js",
      sourceFileSha256: candidateSourceSha256["src/ui/hud-motion.js"],
      appliedAtTick: 171,
      appliedAfterOriginalControlPair: true,
    };
    evidence.intervention.install = await child.evaluate((css) => {
      const style = document.createElement("style");
      style.dataset.frameRestore001Intervention = "dedicated-layer";
      style.textContent = css;
      document.head.appendChild(style);
      const progress = document.querySelector(".hud-resource-progress");
      const rect = progress?.getBoundingClientRect();
      const computed = progress ? getComputedStyle(progress) : null;
      return {
        cssText: style.textContent,
        tick: globalThis.__spriteRendererProbe.state.sessionTick,
        progressFound: Boolean(progress),
        rect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : null,
        transform: computed?.transform ?? null,
        clipPath: computed?.clipPath ?? null,
        resourcePercent: computed?.getPropertyValue("--resource-percent").trim() ?? null,
      };
    }, cssDelta);
    assert.equal(evidence.intervention.install.tick, 171);
    assert.equal(evidence.intervention.install.cssText, cssDelta);
    await waitForPaintFrames(page, child);
    evidence.intervention.beforeTrace = await captureMeterTrace(child, inspector, "dedicated-layer-tick-171-before-advance", evidence.causalTrace.sampleViewportPoints);
    const interventionBeforePng = await capture(page, child, "dedicated-layer-before", evidence);
    const interventionBeforeState = evidence.captures["dedicated-layer-before"].state;
    evidence.intervention.beforeState = interventionBeforeState;
    await child.evaluate(() => window.__frameRestore001MeterMutationTrace.setPhase("dedicated-layer-advance-171-to-179"));
    const interventionLater = await child.evaluate(() => {
      const controller = globalThis.__spriteRendererProbe;
      controller.stepMany(2);
      controller.stepMany(6);
      return { tick: controller.state.sessionTick };
    });
    assert.equal(interventionLater.tick, 179);
    await child.evaluate(() => window.__frameRestore001MeterMutationTrace.setPhase("dedicated-layer-restore-179-to-171"));
    const interventionRestore = await child.evaluate(({ bytes, expectedCombat }) => {
      const controller = globalThis.__spriteRendererProbe;
      controller.restore(bytes);
      controller.enterManualStepMode();
      return { tick: controller.state.sessionTick, combatIdentical: expectedCombat === document.querySelector('[data-game-browser-layer="combat"]').innerHTML };
    }, { bytes: evidence.checkpoint.sessionBytes, expectedCombat: evidence.checkpoint.contactHtml });
    assert.deepEqual(interventionRestore, { tick: 171, combatIdentical: true });
    evidence.intervention.restore = interventionRestore;
    evidence.intervention.afterTrace = await captureMeterTrace(child, inspector, "dedicated-layer-tick-171-after-restore", evidence.causalTrace.sampleViewportPoints);
    const interventionAfterPng = await capture(page, child, "dedicated-layer-after", evidence);
    const interventionAfterState = evidence.captures["dedicated-layer-after"].state;
    evidence.intervention.afterState = interventionAfterState;
    const interventionPixelDiff = await decodedDiff(page, interventionBeforePng, interventionAfterPng);
    evidence.intervention.summary = summarizePair(interventionBeforeState, interventionAfterState, interventionBeforePng, interventionAfterPng, interventionPixelDiff);
    const traceRects = (trace) => Object.fromEntries(Object.entries(trace.dom.nodes).map(([selector, node]) => [selector, node.rect ?? null]));
    evidence.intervention.geometryRectsUnchanged = JSON.stringify(traceRects(evidence.intervention.beforeTrace)) === JSON.stringify(traceRects(evidence.intervention.afterTrace));
    evidence.intervention.controlReproducedPrior29PixelFailure = normalPixelDiff.differingPixelCount === 29 && normalPixelDiff.maximumChannelDelta === 18;
    evidence.intervention.controlPixels = { differingPixelCount: normalPixelDiff.differingPixelCount, maximumChannelDelta: normalPixelDiff.maximumChannelDelta, boundingBox: normalPixelDiff.boundingBox };
    evidence.intervention.interventionPixels = { differingPixelCount: interventionPixelDiff.differingPixelCount, maximumChannelDelta: interventionPixelDiff.maximumChannelDelta, boundingBox: interventionPixelDiff.boundingBox };
    evidence.intervention.progressLayer = {
      controlBefore: evidence.causalTrace.checkpoint171.layers.matches.filter((match) => match.selector === ".hud-resource-progress"),
      controlAfter: evidence.causalTrace.restored171.layers.matches.filter((match) => match.selector === ".hud-resource-progress"),
      interventionBefore: evidence.intervention.beforeTrace.layers.matches.filter((match) => match.selector === ".hud-resource-progress"),
      interventionAfter: evidence.intervention.afterTrace.layers.matches.filter((match) => match.selector === ".hud-resource-progress"),
    };
    evidence.intervention.nonPaintStateUnchanged = ["sessionBytes", "browserSnapshot", "controllerState", "inputDom", "audioContinuationBytes", "fonts", "resources"].every((key) => interventionBeforeState.inner[key] === interventionAfterState.inner[key]) && JSON.stringify(interventionBeforeState.inner.audioPolicy) === JSON.stringify(interventionAfterState.inner.audioPolicy);
    evidence.intervention.transformGeometryStable = JSON.stringify(traceRects(evidence.intervention.beforeTrace)) === JSON.stringify(traceRects(evidence.intervention.afterTrace)) && JSON.stringify(interventionBeforeState.inner.geometry.hud.rect) === JSON.stringify(interventionAfterState.inner.geometry.hud.rect);
    assert.deepEqual(evidence.errors.page, []);
    assert.deepEqual(evidence.errors.console, []);
    assert.deepEqual(missingPaths, []);
    evidence.missingPaths = missingPaths;
    const finalHashes = {};
    for (const file of Object.keys(candidateSourceSha256)) finalHashes[file] = createHash("sha256").update(await readFile(resolve(ROOT, file))).digest("hex");
    evidence.causalTrace.finalSourceSha256 = finalHashes;
    evidence.causalTrace.sourceUnchanged = JSON.stringify(finalHashes) === JSON.stringify(candidateSourceSha256);
    evidence.causalTrace.finalLayerSummary = inspector.layerSummary();
    evidence.result = {
      traceComplete: true,
      normalRestoreExact: Object.values(evidence.normal.exact).every(Boolean),
      normalExact: evidence.normal.exact,
      normalRestoreDifferingPixels: normalPixelDiff.differingPixelCount,
      normalRestoreMaximumChannelDelta: normalPixelDiff.maximumChannelDelta,
      dedicatedLayerRestoreDifferingPixels: interventionPixelDiff.differingPixelCount,
      dedicatedLayerRestoreMaximumChannelDelta: interventionPixelDiff.maximumChannelDelta,
      dedicatedLayerInstalled: evidence.intervention.progressLayer.interventionAfter.length > 0,
      dedicatedLayerGeometryRectsUnchanged: evidence.intervention.geometryRectsUnchanged,
      dedicatedLayerNonPaintStateUnchanged: evidence.intervention.nonPaintStateUnchanged,
      naturalGeometry: outerGeometry,
      sourceUnchanged: evidence.causalTrace.sourceUnchanged,
      reducedMotionRun: false,
      errors: evidence.errors,
    };
    writeFileSync(resolve(OUTPUT, "frame-restore-001-desktop-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
    console.log(JSON.stringify({ status: "desktop-dedicated-layer-intervention-complete", pid: process.pid, viewport: VIEWPORT, naturalGeometry: outerGeometry, normal: evidence.normal.exact, normalDecodedPixels: normalPixelDiff.differingPixelCount, intervention: evidence.intervention.summary.exact, interventionDecodedPixels: interventionPixelDiff.differingPixelCount, progressLayer: evidence.intervention.progressLayer, sourceUnchanged: evidence.causalTrace.sourceUnchanged, evidence: resolve(OUTPUT, "frame-restore-001-desktop-evidence.json") }));
  } catch (error) {
    evidence.result = { passed: false, error: String(error), stack: error?.stack ?? null };
    writeFileSync(resolve(OUTPUT, "frame-restore-001-desktop-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
    throw error;
  } finally {
    if (inspector) await inspector.close().catch(() => {});
    if (browser) await browser.close();
    await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
