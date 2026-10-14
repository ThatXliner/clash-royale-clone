import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = process.env.FRAME_RESTORE_ROOT ?? process.cwd();
const OUTPUT = process.env.FRAME_RESTORE_OUTPUT ?? resolve(ROOT, 'artifacts/frame-restore-round3/builder/final-production-matrix-9f');
const CHROME = process.env.GAME_BROWSER_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const COMMIT = 'f2f55b820bf5ec8fdec279084e8db33e10c881fc';
const BASE = '9f305bb01d0b3c515cfc80f857a303218a1d1acb';
const VIEWPORTS = [{ name: 'phone-390x844', width: 390, height: 844 }, { name: 'desktop-1440x933', width: 1440, height: 933 }];
const DECK = ['skymaul', 'brassbolt', 'reedsting', 'briar-band', 'cinderlings', 'coilblade', 'mossguard', 'copperskiff'];
const OWNED = ['src/ui/game-ui-projection.js', 'src/ui/game-browser-loop.js', 'src/ui/hud-motion.js', 'tests/game-ui-projection.test.js', 'tests/game-browser-loop.test.js'];
const MIME = { '.css': 'text/css; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml' };
mkdirSync(OUTPUT, { recursive: true });
writeFileSync(resolve(OUTPUT, 'runner-pid.txt'), `${process.pid}\n`);
const startedAt = new Date().toISOString();
const terminal = [];
const log = (...args) => { const line = args.map((arg) => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' '); terminal.push(line); console.log(line); };
let exitCode = 0;
process.on('exit', () => {
  writeFileSync(resolve(OUTPUT, 'runner-output.txt'), `${terminal.join('\n')}\n`);
  writeFileSync(resolve(OUTPUT, 'runner-exit.json'), `${JSON.stringify({ pid: process.pid, exitCode: process.exitCode ?? exitCode, startedAt, finishedAt: new Date().toISOString(), commit: COMMIT, base: BASE }, null, 2)}\n`);
});

function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
async function hashFile(path) { return sha(await readFile(resolve(ROOT, path))); }
async function sourceFence() {
  const head = execFileSync('git', ['-C', ROOT, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const isAncestor = execFileSync('git', ['-C', ROOT, 'merge-base', '--is-ancestor', BASE, 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  void isAncestor;
  assert.equal(head, COMMIT, 'matrix must run on the frozen final candidate commit');
  const tracked = execFileSync('git', ['-C', ROOT, 'ls-files', '-z', '--', 'src', 'public'], { encoding: 'utf8' }).split('\0').filter(Boolean);
  const files = [...new Set([...tracked, ...OWNED])].sort();
  const hashes = {};
  for (const path of files) hashes[path] = await hashFile(path);
  const lockSha256 = await hashFile('package-lock.json');
  return { head, base: BASE, baseAncestor: true, ownedPaths: OWNED, runtimePaths: tracked, sourceSha256: hashes, packageLockSha256: lockSha256, nodeVersion: process.version, playwrightVersion: JSON.parse(await readFile(resolve(ROOT, 'node_modules/playwright/package.json'), 'utf8')).version };
}
async function startStaticServer() {
  const missingPaths = [];
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
    if (pathname === '/favicon.ico') return response.writeHead(204).end();
    const file = resolve(ROOT, `.${pathname}`);
    if (file !== ROOT && !file.startsWith(`${ROOT}${sep}`)) return response.writeHead(403).end();
    try {
      const bytes = await readFile(file);
      response.writeHead(200, { 'Cache-Control': 'no-store', 'Content-Length': bytes.length, 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' }).end(bytes);
    } catch {
      missingPaths.push(pathname);
      response.writeHead(404).end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, missingPaths, url: `http://127.0.0.1:${server.address().port}` };
}
async function settle(page, child) {
  await Promise.all([
    page.evaluate(() => document.fonts.ready),
    child.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined))); }),
  ]);
  await Promise.all([
    page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))),
    child.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))),
  ]);
}
async function geometry(page, child, phase) {
  const outer = await page.evaluate((name) => {
    const selectors = { shell: '.app-shell', header: '.app-header', main: '.app-main', view: '#view-battle', heading: '.battle-heading', slot: '[data-battle-frame-slot]', frame: '[data-battle-frame-slot] iframe', nav: '.app-nav' };
    const describe = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect(), css = getComputedStyle(node);
      return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left }, style: { display: css.display, position: css.position, boxSizing: css.boxSizing, padding: css.padding, height: css.height, minHeight: css.minHeight, flex: css.flex, transform: css.transform, transitionProperty: css.transitionProperty, transitionDuration: css.transitionDuration, animationName: css.animationName } };
    };
    return { phase: name, viewport: { innerWidth, innerHeight, dpr: devicePixelRatio, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }, activeView: document.querySelector('.app-shell')?.dataset.viewActive ?? null, nodes: Object.fromEntries(Object.entries(selectors).map(([key, selector]) => [key, describe(document.querySelector(selector))])) };
  }, phase);
  const inner = await child.evaluate((name) => {
    const describe = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const rect = node.getBoundingClientRect(), css = getComputedStyle(node);
      return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left }, style: { display: css.display, position: css.position, width: css.width, height: css.height, padding: css.padding, margin: css.margin, border: css.border, transform: css.transform, transition: css.transition, animation: css.animation, willChange: css.willChange, contain: css.contain } };
    };
    return { phase: name, viewport: { innerWidth, innerHeight, dpr: devicePixelRatio, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches }, document: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight }, arenaShell: describe('[data-ui="arena-shell"]'), arena: describe('[data-ui="arena"]'), hud: describe('.game-browser-layer--hud'), resourceProgress: describe('.hud-resource-progress'), hudCards: [...document.querySelectorAll('.hud-card[data-slot]')].map((node) => { const rect = node.getBoundingClientRect(), css = getComputedStyle(node); return { cardId: node.dataset.cardId ?? null, slot: node.dataset.slot ?? null, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, transform: css.transform, willChange: css.willChange }; }) };
  }, phase);
  return { outer, inner };
}
function safe(value) { try { return JSON.stringify(value) ?? 'undefined'; } catch (error) { return `!serialization-error:${String(error)}`; } }
async function audit(page, child, phase) {
  const g = await geometry(page, child, phase);
  const inner = await child.evaluate(() => {
    const c = globalThis.__spriteRendererProbe;
    const safeValue = (value) => { try { return JSON.stringify(value) ?? 'undefined'; } catch (error) { return `!serialization-error:${String(error)}`; } };
    const inputDom = [...document.querySelectorAll('input,select,textarea,button')].map((n) => ({ tag: n.tagName, ui: n.dataset.ui ?? null, value: 'value' in n ? n.value : null, checked: 'checked' in n ? n.checked : null, pressed: n.getAttribute('aria-pressed'), disabled: n.disabled, text: n.textContent?.trim() ?? '', focus: n === document.activeElement, hover: n.matches(':hover') }));
    const markerState = [...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')].map((marker) => { const rect = marker.getBoundingClientRect(), art = marker.querySelector('.combat-art'); return { id: Number(marker.dataset.combatId), pose: marker.dataset.pose ?? null, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, action: art?.dataset.spriteAction ?? null, tick: art?.dataset.simulationTick ?? null, reducedMotion: art?.dataset.reducedMotion ?? null }; });
    const continuation = c.audioContinuationBytes;
    return {
      tick: c.state.sessionTick,
      sessionBytes: c.session.serialize(),
      browserSnapshot: c.serialize(),
      controllerState: safeValue(c.state),
      inputDom: safeValue(inputDom),
      audioState: safeValue(c.audio),
      audioPolicy: { gainBasisPoints: c.audio?.gainBasisPoints ?? null, muted: c.audio?.muted ?? null },
      audioDiagnostics: safeValue(c.audioDiagnostics),
      audioMixAudit: safeValue(c.audioMixAudit),
      audioContinuationBytes: typeof continuation === 'string' ? continuation : safeValue(continuation),
      audioPcmObservations: safeValue(c.audioPcmObservations),
      fonts: safeValue({ status: document.fonts.status, faces: [...document.fonts].map((face) => ({ family: face.family, style: face.style, weight: face.weight, status: face.status })) }),
      resources: safeValue(performance.getEntriesByType('resource').map(({ name, initiatorType, transferSize, encodedBodySize, decodedBodySize, responseEnd }) => ({ name, initiatorType, transferSize, encodedBodySize, decodedBodySize, responseEnd }))),
      markerState: safeValue(markerState),
      controls: safeValue(inputDom),
      audioSemantic: { continuation: typeof continuation === 'string' ? continuation : safeValue(continuation), policy: { gainBasisPoints: c.audio?.gainBasisPoints ?? null, muted: c.audio?.muted ?? null } },
    };
  });
  return { geometry: g, inner };
}
async function capture(page, child, output, label) {
  await settle(page, child);
  const state = await audit(page, child, label);
  const png = await page.screenshot({ fullPage: false, animations: 'allow' });
  writeFileSync(resolve(output, `${label}.png`), png);
  return { state, png, bytes: png.length, sha256: sha(png) };
}
async function decodedDiff(page, before, after) {
  return page.evaluate(async ({ a, b }) => {
    const decode = async (base64) => { const image = new Image(); image.src = `data:image/png;base64,${base64}`; await image.decode(); const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight; const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0); return { width: canvas.width, height: canvas.height, pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data }; };
    const x = await decode(a), y = await decode(b);
    let count = 0, maximum = 0, minX = Infinity, minY = Infinity, maxX = -1, maxY = -1;
    const first = [];
    for (let i = 0; i < x.pixels.length; i += 4) {
      let delta = 0;
      for (let channel = 0; channel < 4; channel += 1) delta = Math.max(delta, Math.abs(x.pixels[i + channel] - y.pixels[i + channel]));
      if (delta === 0) continue;
      const pixel = i / 4, px = pixel % x.width, py = Math.floor(pixel / x.width);
      count += 1; maximum = Math.max(maximum, delta); minX = Math.min(minX, px); minY = Math.min(minY, py); maxX = Math.max(maxX, px); maxY = Math.max(maxY, py);
      if (first.length < 32) first.push({ x: px, y: py, before: [...x.pixels.slice(i, i + 4)], after: [...y.pixels.slice(i, i + 4)], maxChannelDelta: delta });
    }
    return { dimensionsBefore: [x.width, x.height], dimensionsAfter: [y.width, y.height], differingPixelCount: count, maximumChannelDelta: maximum, boundingBox: count ? { minX, minY, maxX, maxY } : null, firstDifferingPixels: first };
  }, { a: before.toString('base64'), b: after.toString('base64') });
}
function exactAudit(before, after) {
  const exactFields = ['sessionBytes', 'browserSnapshot', 'controllerState', 'inputDom', 'audioContinuationBytes', 'audioPolicy', 'fonts', 'resources', 'markerState'];
  const fields = Object.fromEntries(exactFields.map((key) => [key, key === 'audioPolicy' ? JSON.stringify(before.inner[key]) === JSON.stringify(after.inner[key]) : before.inner[key] === after.inner[key]]));
  fields.geometry = geometrySignature(before.geometry) === geometrySignature(after.geometry);
  fields.viewport = before.inner.tick === after.inner.tick;
  return fields;
}
function geometrySignature(value) {
  const { phase: _outerPhase, ...outer } = value.outer;
  const { phase: _innerPhase, ...inner } = value.inner;
  return JSON.stringify({ outer, inner });
}
function nonzeroNaturalGeometry(g) {
  const slot = g.outer.nodes.slot?.rect, frame = g.outer.nodes.frame?.rect;
  const arena = g.inner.arena?.rect, hud = g.inner.hud?.rect;
  return Boolean(slot && frame && arena && hud && slot.width > 0 && slot.height > 0 && frame.width > 0 && frame.height > 0 && arena.width > 0 && arena.height > 0 && hud.width > 0 && hud.height > 0);
}
async function runViewport(browser, serverUrl, viewport, missingPaths) {
  const output = resolve(OUTPUT, viewport.name);
  mkdirSync(output, { recursive: true });
  const pageErrors = [], consoleErrors = [];
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  try {
    const response = await page.goto(`${serverUrl}/public/index.html`, { waitUntil: 'networkidle' });
    assert.equal(response?.status(), 200, `${viewport.name}: app-shell document must load`);
    await page.locator('.app-nav [data-nav-to="battle"]').click();
    const frameElement = page.locator('[data-battle-frame-slot] iframe');
    await frameElement.waitFor({ state: 'attached' });
    const frame = frameElement.contentFrame();
    await frame.locator('[data-ui="arena"]').waitFor({ state: 'visible', timeout: 8000 });
    const child = page.frames().find((candidate) => candidate.url().includes('app-frame=1'));
    assert.ok(child, `${viewport.name}: mounted app iframe must be present`);
    const boot = await child.evaluate(async (deck) => {
      const { arenaHudController: controller } = await import('/src/ui/arena-shell-entry.js');
      globalThis.__spriteRendererProbe = controller;
      const wasRunning = !controller.state.paused;
      if (wasRunning) controller.pause();
      controller.replaceDeck(deck);
      const resumed = controller.state.paused ? controller.resume() : false;
      const manual = controller.enterManualStepMode();
      return { deck: JSON.parse(controller.session.serialize()).setup.deck, pausedBeforeSetup: !wasRunning, running: !controller.state.paused, resumed, manual, state: controller.state };
    }, DECK);
    assert.deepEqual(boot.deck, DECK);
    assert.equal(boot.pausedBeforeSetup, false);
    assert.equal(boot.manual, true);
    assert.equal(boot.running, true);
    const card = frame.locator('[data-ui="card-slot"][data-card-id="briar-band"]');
    await card.waitFor();
    await card.click();
    const arena = frame.locator('[data-ui="arena"]');
    const arenaBox = await arena.boundingBox();
    assert.ok(arenaBox && arenaBox.width > 0 && arenaBox.height > 0, `${viewport.name}: natural arena input target must be present`);
    await page.mouse.click(arenaBox.x + arenaBox.width / 2, arenaBox.y + arenaBox.height * 0.54);
    const attack = await child.evaluate(() => {
      const c = globalThis.__spriteRendererProbe;
      for (let step = 0; step < 600; step += 1) {
        const before = c.session.state;
        const events = c.stepMany(1);
        const state = c.session.state;
        const units = new Map(before.battle.units.map((unit) => [unit.id, unit]));
        const event = events.find((item) => item.type === 'attack' && units.get(item.attackerId)?.archetypeId === 'briar-runner' && units.get(item.attackerId)?.side === 'south');
        if (!event) continue;
        const damage = events.find((item) => item.type === 'damage' && item.attackerId === event.attackerId && item.targetId === event.targetId && item.delivery === 'melee' && item.tick === event.tick);
        if (!damage) continue;
        const unit = state.battle.units.find((candidate) => candidate.id === event.attackerId);
        const marker = [...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')].find((node) => node.dataset.combatId === String(event.attackerId));
        const art = marker?.querySelector('.combat-art');
        return { attack: { attackerId: event.attackerId, sequence: event.sequence, targetId: event.targetId, tick: event.tick, type: event.type }, damage: { amount: damage.amount, attackerId: damage.attackerId, currentHealthAfter: damage.currentHealthAfter, currentHealthBefore: damage.currentHealthBefore, delivery: damage.delivery, targetId: damage.targetId, tick: damage.tick, type: damage.type }, frame: art ? { action: art.dataset.spriteAction ?? null, attackAge: art.dataset.attackAnimationAge ?? null, pose: marker?.dataset.pose ?? null, tick: Number(art.dataset.simulationTick) } : null, source: unit ? { alive: unit.alive, attackSequence: unit.attack.attackSequence, archetypeId: unit.archetypeId, delivery: unit.delivery, id: unit.id, hitpoints: unit.hitpoints, side: unit.side, targetId: unit.attack.targetId, phase: unit.attack.phase, nextTick: unit.attack.nextTick, nextAttackTick: unit.attack.nextAttackTick, sourceTick: unit.spawnedAt + unit.attack.nextAttackTick - unit.attack.config.hitSpeedTicks } : null, sessionTick: state.tick };
      }
      return null;
    });
    assert.ok(attack, `${viewport.name}: canonical Briar melee event must occur`);
    assert.equal(attack.attack.tick, 170);
    assert.equal(attack.sessionTick, 171);
    assert.equal(attack.attack.type, 'attack');
    assert.equal(attack.damage.delivery, 'melee');
    assert.equal(attack.damage.amount, 120);
    assert.equal(attack.damage.currentHealthBefore, 81);
    assert.equal(attack.damage.currentHealthAfter, 0);
    assert.equal(attack.source.id, 1);
    assert.equal(attack.source.archetypeId, 'briar-runner');
    assert.equal(attack.source.phase, 'cycling');
    assert.equal(attack.source.targetId, 9);
    assert.equal(attack.source.nextTick, 171);
    assert.equal(attack.source.nextAttackTick, 236);
    assert.equal(attack.frame.action, 'walk');
    assert.equal(attack.frame.attackAge, null);
    assert.equal(attack.frame.pose, 'attack');
    assert.equal(attack.frame.tick, 171);
    await frame.locator('.combat-marker[data-kind="briar-runner"]').first().waitFor({ state: 'attached', timeout: 5000 });
    const initialGeometry = await geometry(page, child, 'normal-checkpoint-171');
    assert.ok(nonzeroNaturalGeometry(initialGeometry), `${viewport.name}: no natural app/frame/arena/HUD geometry`);
    const checkpoint = await child.evaluate(() => ({ bytes: globalThis.__spriteRendererProbe.serialize(), sessionBytes: globalThis.__spriteRendererProbe.session.serialize(), combat: document.querySelector('[data-game-browser-layer="combat"]').innerHTML }));
    const checkpointAudit = await audit(page, child, 'normal-checkpoint-171');
    assert.equal(checkpointAudit.inner.tick, 171);
    const normalBefore = await capture(page, child, output, 'normal-before-restore-171');
    const advance = await child.evaluate(() => {
      const c = globalThis.__spriteRendererProbe;
      const first = c.stepMany(2), at173 = c.state.sessionTick;
      const source = c.session.state.battle.units.find((unit) => unit.id === 1);
      const marker = [...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')].find((node) => node.dataset.combatId === '1');
      const art = marker?.querySelector('.combat-art');
      const at173Witness = { phase: source?.attack.phase ?? null, hp: source?.hitpoints ?? null, targetId: source?.attack.targetId ?? null, pose: marker?.dataset.pose ?? null, action: art?.dataset.spriteAction ?? null, tick: Number(art?.dataset.simulationTick) };
      const second = c.stepMany(6);
      return { twoTickEvents: first.length, at173, at173Witness, sixTickEvents: second.length, at179: c.state.sessionTick };
    });
    assert.equal(advance.at173, 173);
    assert.deepEqual(advance.at173Witness, { phase: 'winding', hp: 121, targetId: 10, pose: 'idle', action: 'walk', tick: 173 });
    assert.equal(advance.at179, 179);
    const normalRestore = await child.evaluate(({ bytes, combat }) => {
      const c = globalThis.__spriteRendererProbe;
      c.restore(bytes);
      const manual = c.enterManualStepMode();
      return { tick: c.state.sessionTick, manual, sessionBytes: c.session.serialize(), combat: document.querySelector('[data-game-browser-layer="combat"]').innerHTML, eventCount: c.session.state?.eventLog?.length ?? null };
    }, checkpoint);
    assert.equal(normalRestore.tick, 171);
    assert.equal(normalRestore.sessionBytes, checkpoint.sessionBytes);
    assert.equal(normalRestore.combat, checkpoint.combat);
    const normalAfter = await capture(page, child, output, 'normal-after-restore-171');
    const normalDiff = await decodedDiff(page, normalBefore.png, normalAfter.png);
    const normalStateExact = exactAudit(checkpointAudit, normalAfter.state);
    normalStateExact.restoredCombatMarkup = checkpoint.combat === normalRestore.combat;
    const normalGate = { naturalGeometryPresent: nonzeroNaturalGeometry(initialGeometry), geometryUnchanged: geometrySignature(normalBefore.state.geometry) === geometrySignature(normalAfter.state.geometry), exactAudit: Object.values(normalStateExact).every(Boolean), wholeViewportPngExact: normalBefore.png.equals(normalAfter.png), decodedPixelsExact: normalDiff.differingPixelCount === 0, tick171Restored: normalRestore.tick === 171, naturalGeometryStable: geometrySignature(initialGeometry) === geometrySignature(normalBefore.state.geometry) };

    await page.emulateMedia({ reducedMotion: 'reduce' });
    const lateReducedRestore = await child.evaluate((bytes) => {
      const c = globalThis.__spriteRendererProbe;
      c.restore(bytes);
      const manual = c.enterManualStepMode();
      const media = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const marker = [...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')].find((node) => node.dataset.combatId === '1');
      const art = marker?.querySelector('.combat-art');
      return { media, manual, tick: c.state.sessionTick, pose: marker?.dataset.pose ?? null, action: art?.dataset.spriteAction ?? null, reducedMotion: art?.dataset.reducedMotion ?? null, simulationTick: Number(art?.dataset.simulationTick) };
    }, checkpoint.bytes);
    assert.equal(lateReducedRestore.media, true);
    assert.equal(lateReducedRestore.tick, 171);
    assert.equal(lateReducedRestore.pose, 'attack');
    assert.equal(lateReducedRestore.action, 'walk');
    assert.equal(lateReducedRestore.reducedMotion, 'true');
    assert.equal(lateReducedRestore.simulationTick, 171);
    const reducedAdvance = await child.evaluate(() => {
      const c = globalThis.__spriteRendererProbe;
      const events = c.stepMany(2);
      const marker = [...document.querySelectorAll('.combat-marker[data-kind="briar-runner"]')].find((node) => node.dataset.combatId === '1');
      const art = marker?.querySelector('.combat-art');
      const unit = c.session.state.battle.units.find((candidate) => candidate.id === 1);
      return { eventCount: events.length, tick: c.state.sessionTick, pose: marker?.dataset.pose ?? null, action: art?.dataset.spriteAction ?? null, reducedMotion: art?.dataset.reducedMotion ?? null, phase: unit?.attack.phase ?? null, hp: unit?.hitpoints ?? null, targetId: unit?.attack.targetId ?? null };
    });
    assert.ok(Number.isInteger(reducedAdvance.eventCount));
    assert.deepEqual({ tick: reducedAdvance.tick, pose: reducedAdvance.pose, action: reducedAdvance.action, reducedMotion: reducedAdvance.reducedMotion, phase: reducedAdvance.phase, hp: reducedAdvance.hp, targetId: reducedAdvance.targetId }, { tick: 173, pose: 'idle', action: 'walk', reducedMotion: 'true', phase: 'winding', hp: 121, targetId: 10 });
    const reducedCheckpoint = await child.evaluate(() => ({ bytes: globalThis.__spriteRendererProbe.serialize(), sessionBytes: globalThis.__spriteRendererProbe.session.serialize(), combat: document.querySelector('[data-game-browser-layer="combat"]').innerHTML }));
    const reducedAudit = await audit(page, child, 'reduced-checkpoint-173');
    assert.equal(reducedAudit.inner.tick, 173);
    const reducedBefore = await capture(page, child, output, 'reduced-before-restore-173');
    const beforeZeroAudit = await audit(page, child, 'reduced-before-stepMany-zero');
    let zeroResult;
    try {
      zeroResult = await child.evaluate(() => {
        const c = globalThis.__spriteRendererProbe;
        const events = c.stepMany(0);
        return { accepted: true, eventCount: events.length, events, tick: c.state.sessionTick, sessionBytes: c.session.serialize(), browserSnapshot: c.serialize(), controllerState: JSON.stringify(c.state), audioContinuationBytes: typeof c.audioContinuationBytes === 'string' ? c.audioContinuationBytes : JSON.stringify(c.audioContinuationBytes), audioPolicy: { gainBasisPoints: c.audio?.gainBasisPoints ?? null, muted: c.audio?.muted ?? null } };
      });
    } catch (error) { zeroResult = { accepted: false, error: String(error) }; }
    const afterZeroAudit = await audit(page, child, 'reduced-after-stepMany-zero');
    const zeroStepExact = zeroResult.accepted === true && zeroResult.eventCount === 0 && zeroResult.tick === 173 && beforeZeroAudit.inner.sessionBytes === afterZeroAudit.inner.sessionBytes && beforeZeroAudit.inner.browserSnapshot === afterZeroAudit.inner.browserSnapshot && beforeZeroAudit.inner.controllerState === afterZeroAudit.inner.controllerState && beforeZeroAudit.inner.audioContinuationBytes === afterZeroAudit.inner.audioContinuationBytes && JSON.stringify(beforeZeroAudit.inner.audioPolicy) === JSON.stringify(afterZeroAudit.inner.audioPolicy) && beforeZeroAudit.inner.inputDom === afterZeroAudit.inner.inputDom;
    const plusOneRestore = await child.evaluate((bytes) => {
      const c = globalThis.__spriteRendererProbe;
      const events = c.stepMany(1);
      const advanced = c.state.sessionTick;
      c.restore(bytes);
      const manual = c.enterManualStepMode();
      return { eventCount: events.length, from: 173, advanced, restored: c.state.sessionTick, manual, sessionBytes: c.session.serialize(), combat: document.querySelector('[data-game-browser-layer="combat"]').innerHTML };
    }, reducedCheckpoint.bytes);
    assert.equal(plusOneRestore.advanced, 174);
    assert.equal(plusOneRestore.restored, 173);
    assert.equal(plusOneRestore.sessionBytes, reducedCheckpoint.sessionBytes);
    assert.equal(plusOneRestore.combat, reducedCheckpoint.combat);
    const reducedAfter = await capture(page, child, output, 'reduced-after-plus1-restore-173');
    const reducedDiff = await decodedDiff(page, reducedBefore.png, reducedAfter.png);
    const reducedStateExact = exactAudit(reducedAudit, reducedAfter.state);
    reducedStateExact.restoredCombatMarkup = reducedCheckpoint.combat === plusOneRestore.combat;
    const reducedGate = { checkpointTick173: reducedAudit.inner.tick === 173, lateReducedMotionApplied: lateReducedRestore.media && lateReducedRestore.reducedMotion === 'true', zeroStepLegalAndByteIdentical: zeroStepExact, plusOneRestored174To173: plusOneRestore.advanced === 174 && plusOneRestore.restored === 173, exactAudit: Object.values(reducedStateExact).every(Boolean), geometryUnchanged: geometrySignature(reducedBefore.state.geometry) === geometrySignature(reducedAfter.state.geometry), wholeViewportPngExact: reducedBefore.png.equals(reducedAfter.png), decodedPixelsExact: reducedDiff.differingPixelCount === 0 };
    const contextResult = {
      viewport, actualViewport: initialGeometry.outer.viewport,
      boot, attack, initialNaturalGeometry: initialGeometry,
      normal: { advance, restore: normalRestore, checkpointAudit, before: { bytes: normalBefore.bytes, sha256: normalBefore.sha256 }, after: { bytes: normalAfter.bytes, sha256: normalAfter.sha256 }, exactStateFields: normalStateExact, pixelDiff: normalDiff, gate: normalGate },
      reduced: { lateRestore: lateReducedRestore, advance: reducedAdvance, checkpointAudit: reducedAudit, zeroStep: { result: zeroResult, byteIdenticalAndLegal: zeroStepExact, before: beforeZeroAudit.inner, after: afterZeroAudit.inner }, plusOneRestore, before: { bytes: reducedBefore.bytes, sha256: reducedBefore.sha256 }, after: { bytes: reducedAfter.bytes, sha256: reducedAfter.sha256 }, exactStateFields: reducedStateExact, pixelDiff: reducedDiff, gate: reducedGate },
      restoreCount: 3, pageErrors, consoleErrors,
    };
    writeFileSync(resolve(output, 'context-evidence.json'), `${JSON.stringify(contextResult, null, 2)}\n`);
    log({ context: viewport.name, pid: process.pid, normal: normalGate, normalPixelDiff: { count: normalDiff.differingPixelCount, max: normalDiff.maximumChannelDelta, bbox: normalDiff.boundingBox }, reduced: reducedGate, reducedPixelDiff: { count: reducedDiff.differingPixelCount, max: reducedDiff.maximumChannelDelta, bbox: reducedDiff.boundingBox }, naturalFrame: initialGeometry.outer.nodes.frame.rect, restoreCount: 3 });
    assert.equal(Object.values(normalGate).every(Boolean), true, `${viewport.name}: normal checkpoint restore failed: ${JSON.stringify(normalGate)}`);
    assert.equal(Object.values(reducedGate).every(Boolean), true, `${viewport.name}: reduced checkpoint restore failed: ${JSON.stringify(reducedGate)}`);
    assert.deepEqual(pageErrors, [], `${viewport.name}: page errors`);
    assert.deepEqual(consoleErrors, [], `${viewport.name}: console errors`);
    return contextResult;
  } catch (error) {
    writeFileSync(resolve(output, 'context-failure.json'), `${JSON.stringify({ viewport, pid: process.pid, error: String(error), stack: error?.stack ?? null, pageErrors, consoleErrors }, null, 2)}\n`);
    throw error;
  } finally {
    await context.close();
  }
}
async function main() {
  const beforeFence = await sourceFence();
  writeFileSync(resolve(OUTPUT, 'source-fence-before.json'), `${JSON.stringify(beforeFence, null, 2)}\n`);
  const { server, missingPaths, url } = await startStaticServer();
  let browser;
  const matrix = [];
  try {
    browser = await chromium.launch({ executablePath: existsSync(CHROME) ? CHROME : undefined, headless: true });
    const browserVersion = browser.version();
    log({ status: 'matrix-start', pid: process.pid, commit: beforeFence.head, base: beforeFence.base, browserVersion, chromiumPath: existsSync(CHROME) ? CHROME : 'playwright-default', viewports: VIEWPORTS });
    for (const viewport of VIEWPORTS) matrix.push(await runViewport(browser, url, viewport, missingPaths));
    const afterFence = await sourceFence();
    const sourceUnchanged = JSON.stringify(beforeFence.sourceSha256) === JSON.stringify(afterFence.sourceSha256) && beforeFence.head === afterFence.head;
    const evidence = { diagnostic: 'FRAME-RESTORE-001 final frozen-candidate production-CSS matrix', startedAt, finishedAt: new Date().toISOString(), pid: process.pid, commit: beforeFence.head, base: beforeFence.base, browserVersion, chromiumPath: existsSync(CHROME) ? CHROME : 'playwright-default', sourceFenceBefore: beforeFence, sourceFenceAfter: afterFence, sourceUnchanged, missingPaths, contexts: matrix, overall: { sourceUnchanged, allContextsGreen: matrix.length === VIEWPORTS.length && matrix.every((context) => Object.values(context.normal.gate).every(Boolean) && Object.values(context.reduced.gate).every(Boolean)) && missingPaths.length === 0 } };
    writeFileSync(resolve(OUTPUT, 'matrix-evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
    log({ status: evidence.overall.allContextsGreen && sourceUnchanged ? 'matrix-green' : 'matrix-failed', pid: process.pid, sourceUnchanged, missingPaths, contexts: matrix.map((context) => ({ viewport: context.viewport.name, normal: context.normal.gate, normalPixels: context.normal.pixelDiff.differingPixelCount, reduced: context.reduced.gate, reducedPixels: context.reduced.pixelDiff.differingPixelCount })), evidence: resolve(OUTPUT, 'matrix-evidence.json') });
    assert.equal(sourceUnchanged, true, 'candidate runtime/source dependencies changed during matrix');
    assert.equal(evidence.overall.allContextsGreen, true, 'one or more strict matrix contexts failed');
  } catch (error) {
    exitCode = 1;
    writeFileSync(resolve(OUTPUT, 'matrix-failure.json'), `${JSON.stringify({ pid: process.pid, commit: COMMIT, error: String(error), stack: error?.stack ?? null, contextsCompleted: matrix.map((context) => context.viewport.name), missingPaths }, null, 2)}\n`);
    throw error;
  } finally {
    if (browser) await browser.close();
    await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  }
}
main().catch((error) => { exitCode = 1; console.error(error); process.exitCode = 1; });
