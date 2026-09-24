import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { COMBAT_ART_ARCHETYPES } from '../src/ui/combat-art.js';
const OUT = new URL('../artifacts/visual-003c-round-3/', import.meta.url).pathname;
const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ?? '/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs';

test('visual combat assets: every original silhouette mounts at game scale, restores exactly, and hides diagnostic links', { timeout: 120000 }, async () => {
  mkdirSync(OUT, { recursive: true });
  const server = spawn(process.execPath, [new URL('./game-browser-journey-server.js', import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'inherit'] });
  let browser;
  try {
    const ready = await new Promise((resolve, reject) => {
      let text = ''; server.stdout.on('data', chunk => { text += chunk; if (text.includes('\n')) resolve(JSON.parse(text.split('\n')[0])); });
      server.on('error', reject);
    });
    const { chromium } = await import(PLAYWRIGHT);
    browser = await chromium.launch({ executablePath: process.env.GAME_BROWSER_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
    const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`http://${ready.host}:${ready.port}/public/ui-arena-shell.html?session-profile=live-seed-2-terminal`);
    await page.waitForSelector('[data-ui="arena"]');
    // Capture an actual session before mounting the labeled contact-sheet fixture.
    await page.evaluate(async () => {
      const controller = (await import('/src/ui/arena-shell-entry.js')).arenaHudController;
      controller.enterManualStepMode();
      controller.stepMany(430 - controller.state.sessionTick);
    });
    await page.screenshot({ path: `${OUT}before-attack.png` });
    const timeline = [];
    for (const tick of [435, 443]) {
      timeline.push(await page.evaluate(async tick => {
        const controller = (await import('/src/ui/arena-shell-entry.js')).arenaHudController;
        controller.stepMany(tick - controller.state.sessionTick);
        const marker = document.querySelector('[data-combat-id="1"]');
        const contact = document.querySelector('.combat-melee-contact');
        return { tick, pose: marker.dataset.pose, transform: getComputedStyle(marker.querySelector('.combat-art')).transform,
          contactTick: contact?.dataset.contactTick ?? null, targetId: contact?.dataset.targetId ?? null,
          contactCount: document.querySelectorAll('.combat-melee-contact').length };
      }, tick));
      await page.screenshot({ path: `${OUT}${tick === 435 ? 'during' : 'after'}-attack.png` });
    }
    assert.equal(timeline[0].pose, 'attack');
    assert.equal(timeline[0].contactTick, '434');
    assert.equal(timeline[0].targetId, 'south:lane:west');
    assert.equal(timeline[0].contactCount, 1);
    assert.equal(timeline[1].contactCount, 0);
    assert.notEqual(timeline[1].pose, 'attack');
    writeFileSync(`${OUT}attack-timeline.json`, JSON.stringify(timeline, null, 2));
    const result = await page.evaluate(async kinds => {
      const { createCombatViewModel, bindCombatViewModel, serializeCombatViewModel, restoreCombatViewModel } = await import('/src/ui/combat-state.js');
      const { arenaHudController } = await import('/src/ui/arena-shell-entry.js');
      arenaHudController.enterManualStepMode();
      const arena = document.querySelector('[data-ui="arena"]');
      const layer = document.querySelector('[data-game-browser-layer="combat"]');
      const entities = ['north', 'south'].flatMap((side, si) => kinds.map((kind, i) => ({
        id: si * 20 + i + 1, kind, side, layer: ['skymaul','copperskiff'].includes(kind) ? 'air' : 'ground',
        position: { x: 3500 + (i % 3) * 5500, y: 28000 - si * 14000 - Math.floor(i / 3) * 4000 },
        hitpoints: 70, maxHitpoints: 100, targetId: null,
      })));
      entities[0].targetId = entities[kinds.length].id;
      const view = createCombatViewModel({ entities, towers: [], events: [], tick: 400 });
      bindCombatViewModel(layer, view);
      const before = layer.innerHTML;
      bindCombatViewModel(layer, restoreCombatViewModel(serializeCombatViewModel(view)));
      const restored = before === layer.innerHTML;
      const rect = arena.getBoundingClientRect();
      const art = [...layer.querySelectorAll('.combat-art')].map(svg => {
        const marker = svg.parentNode;
        const paths = [...svg.querySelectorAll('path')];
        const pathData = paths.map(path => ({
          d: path.getAttribute('d'),
          fill: path.getAttribute('fill'),
          stroke: path.getAttribute('stroke'),
        }));
        return {
          kind: svg.dataset.artId,
          markerKind: marker.dataset.kind,
          side: marker.dataset.side,
          paths: pathData.map(path => path.d).join('|'),
          pathData,
          healthHeight: marker.querySelector(".combat-health").getBoundingClientRect().height,
          width: svg.getBoundingClientRect().width,
          height: svg.getBoundingClientRect().height,
        };
      });
      const linksHidden = [...layer.querySelectorAll('.combat-target-link')].every(n => getComputedStyle(n).display === 'none');
      for (const node of layer.querySelectorAll('.combat-marker')) {
        const label = document.createElement('b'); label.textContent = node.dataset.kind;
        label.style.cssText = 'position:absolute;top:110%;left:50%;translate:-50% 0;font:10px sans-serif;white-space:nowrap;color:#191D22;background:#F4EBD6'; node.append(label);
      }
      return { restored, linksHidden, art, arenaWidth: rect.width };
    }, COMBAT_ART_ARCHETYPES);
    await page.screenshot({ path: `${OUT}contact-sheet.png` });
    await page.evaluate(async () => {
      (await import('/src/ui/arena-shell-entry.js')).arenaHudController.dispose();
      const { GameSession } = await import('/src/sim/game-session.js');
      const { createShippedGameSessionSetup, mountShippedGameBrowser } = await import('/src/ui/game-browser-entry.js');
      globalThis.deathController = mountShippedGameBrowser(document.querySelector('[data-arena-shell-root]'), window,
        new GameSession(createShippedGameSessionSetup(2)));
      deathController.enterManualStepMode();
    });
    const deaths = [];
    for (const tick of [413, 414, 419, 432]) {
      deaths.push(await page.evaluate(tick => {
        deathController.stepMany(tick - deathController.state.sessionTick);
        let corpse = document.querySelector('[data-death-id="1"]');
        const bytes = () => [...document.querySelectorAll('[data-game-browser-layer="combat"],[data-game-browser-layer="effects"]')].map(n => n.innerHTML).join('');
        const before = bytes();
        if (tick === 414) { deathController.restore(deathController.serialize()); deathController.enterManualStepMode(); }
        corpse = document.querySelector('[data-death-id="1"]');
        return { tick, corpse: Boolean(corpse), kind: corpse?.dataset.kind, side: corpse?.dataset.side,
          health: corpse?.querySelectorAll('.combat-health').length ?? 0,
          live: Boolean(document.querySelector('[data-combat-id="1"]')),
          hitRegion: corpse ? getComputedStyle(corpse).pointerEvents : null,
          residual: [...document.querySelectorAll('[data-residual-impact]')].some(n => n.dataset.impactTick === '413'),
          restored: before === bytes() };
      }, tick));
      await page.screenshot({ path: `${OUT}death-${tick}.png` });
    }
    assert.equal(deaths[0].corpse, false);
    for (const state of deaths.slice(1, 3)) {
      assert.equal(state.corpse, true); assert.equal(state.kind, 'brassbolt'); assert.equal(state.side, 'north');
      assert.equal(state.live, false); assert.equal(state.health, 0); assert.equal(state.hitRegion, 'none');
    }
    assert.equal(deaths[1].residual, true);
    assert.equal(deaths[1].restored, true);
    assert.equal(deaths[3].corpse, false);
    writeFileSync(`${OUT}death-timeline.json`, JSON.stringify(deaths, null, 2));
    assert.equal(result.restored, true);
    assert.equal(result.linksHidden, true);
    assert.equal(result.art.length, COMBAT_ART_ARCHETYPES.length * 2);
    const expectedMapping = ['north', 'south'].flatMap(side =>
      COMBAT_ART_ARCHETYPES.map(kind => ({ kind, markerKind: kind, side })));
    assert.deepEqual(result.art.map(({ kind, markerKind, side }) =>
      ({ kind, markerKind, side })), expectedMapping,
    'every rendered team variant must map to its registry kind and side');
    for (const side of ['north', 'south']) {
      const teamArt = result.art.filter(art => art.side === side);
      assert.equal(teamArt.length, COMBAT_ART_ARCHETYPES.length,
        `${side} must render every registered archetype exactly once`);
      assert.equal(new Set(teamArt.map(art => art.paths)).size,
        COMBAT_ART_ARCHETYPES.length,
        `${side} must retain a distinct silhouette for every archetype`);
    }
    const artBySideAndKind = new Map(result.art.map(art =>
      [`${art.side}\0${art.kind}`, art]));
    for (const kind of COMBAT_ART_ARCHETYPES) {
      const north = artBySideAndKind.get(`north\0${kind}`);
      const south = artBySideAndKind.get(`south\0${kind}`);
      const northBody = north.pathData.slice(0, -1);
      const southBody = south.pathData.slice(0, -1);
      assert.deepEqual(northBody.map(path => path.d),
        southBody.map(path => path.d),
        `${kind} must retain identical body geometry across teams`);
      const teamPathIndices = northBody.flatMap((path, index) =>
        path.fill === southBody[index].fill ? [] : [index]);
      assert.equal(teamPathIndices.length, 1,
        `${kind} must have exactly one side-colored body path`);
      const teamPathIndex = teamPathIndices[0];
      assert.equal(northBody[teamPathIndex].fill, '#C6452E',
        `${kind} north team path must be ember red`);
      assert.equal(southBody[teamPathIndex].fill, '#2E7F86',
        `${kind} south team path must be river teal`);
    }
    assert.ok(result.art.every(a => a.width >= 20 && a.width <= 55 && a.height >= 20));
    assert.ok(result.art.every(a => a.healthHeight === 4));
    assert.deepEqual(errors, []);
    writeFileSync(`${OUT}render-evidence.json`, JSON.stringify(result, null, 2));
  } finally { await browser?.close(); server.kill('SIGTERM'); }
});


test('visual combat motion: authenticated tick435 pose restores and chunks identically', async () => {
  const { GameSession } = await import('../src/sim/game-session.js');
  const { createShippedGameSessionSetup } = await import('../src/ui/game-browser-entry.js');
  const { createCombatMotionView } = await import('../src/ui/combat-motion.js');
  const setup = createShippedGameSessionSetup(2, 'live-seed-2-terminal');
  const direct = new GameSession(setup); direct.stepMany(435);
  const chunked = new GameSession(setup);
  for (const count of [12, 118, 270, 35]) chunked.stepMany(count);
  const pose = createCombatMotionView(direct.projectionSnapshot());
  assert.equal(pose.poses[0].pose, 'attack');
  assert.equal(pose.contacts[0].tick, 434);
  assert.equal(pose.contacts[0].targetId, 'south:lane:west');
  assert.deepEqual(createCombatMotionView(chunked.projectionSnapshot()), pose);
  assert.deepEqual(createCombatMotionView(GameSession.restore(direct.serialize()).projectionSnapshot()), pose);
  assert.throws(() => createCombatMotionView({ state: direct.state }), /authentic/);
  const delayed = new GameSession(setup.replace('"thinkOffsetTicks":0', '"thinkOffsetTicks":12'));
  delayed.stepMany(447);
  assert.equal(delayed.state.battle.units[0].spawnedAt, 12);
  const delayedPose = createCombatMotionView(delayed.projectionSnapshot());
  assert.equal(delayedPose.contacts[0].tick, 446);
  assert.equal(delayedPose.contacts[0].age, 1);
  assert.deepEqual(createCombatMotionView(GameSession.restore(delayed.serialize()).projectionSnapshot()), delayedPose);
  direct.stepMany(8);
  assert.equal(createCombatMotionView(direct.projectionSnapshot()).contacts.length, 0);
});


test('visual combat motion: death lifetime uses canonical death tick across restore and chunks', async () => {
  const { GameSession } = await import('../src/sim/game-session.js');
  const { createShippedGameSessionSetup } = await import('../src/ui/game-browser-entry.js');
  const { createCombatMotionView } = await import('../src/ui/combat-motion.js');
  const setup = createShippedGameSessionSetup(2);
  const direct = new GameSession(setup); direct.stepMany(414);
  const chunked = new GameSession(setup); for (const count of [100, 200, 114]) chunked.stepMany(count);
  const view = createCombatMotionView(direct.projectionSnapshot());
  assert.equal(view.deaths[0].tick, 413); assert.equal(view.deaths[0].kind, 'brassbolt');
  assert.ok(view.residuals.some(r => r.tick === 413));
  assert.deepEqual(createCombatMotionView(chunked.projectionSnapshot()), view);
  assert.deepEqual(createCombatMotionView(GameSession.restore(direct.serialize()).projectionSnapshot()), view);
  direct.stepMany(17);
  assert.equal(createCombatMotionView(direct.projectionSnapshot()).deaths.some(d => d.id === 1), false);
});
