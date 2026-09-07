import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { GameSession } from '../src/sim/game-session.js';
import { createShippedGameSessionSetup } from '../src/ui/game-browser-entry.js';

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ?? '/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs';
const CHROME = process.env.GAME_BROWSER_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ARTIFACTS = new URL('../artifacts/visual-003g-round-1/', import.meta.url).pathname;
async function ready(stream) {
  let buffer = '';
  for await (const chunk of stream) { buffer += chunk; if (buffer.includes('\n')) return JSON.parse(buffer.split('\n')[0]); }
  throw new Error('journey server did not start');
}
async function click(page, selector, offset) {
  const box = await page.locator(selector).first().boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, selector);
  await page.mouse.click(box.x + (offset?.x ?? box.width / 2), box.y + (offset?.y ?? box.height / 2));
}

test('production presentation: original art and trusted controls through an authentic match', { timeout: 600_000 }, async () => {
  mkdirSync(ARTIFACTS, { recursive: true });
  const server = spawn(process.execPath, [new URL('./game-browser-journey-server.js', import.meta.url).pathname], { stdio: ['ignore', 'pipe', 'pipe'] });
  let browser, page;
  const errors = [], frames = [];
  try {
    const address = await ready(server.stdout);
    const { chromium } = await import(PLAYWRIGHT);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
    page.on('pageerror', error => errors.push(String(error)));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    page.on('requestfailed', request => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
    const open = async (profile = '') => {
      await page.goto(`http://${address.host}:${address.port}/public/ui-arena-shell.html${profile}`, { waitUntil: 'networkidle' });
      await page.evaluate(async () => {
        globalThis.journey = (await import('/src/ui/arena-shell-entry.js')).arenaHudController;
        journey.enterManualStepMode();
      });
    };
    const capture = async name => {
      const evidence = await page.evaluate(() => {
        const box = node => { const b = node.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
        const visible = node => getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().width > 0;
        return { tick: journey.state.sessionTick, terminal: journey.state.terminal,
          crowns: journey.session.state.clock.crowns,
          towers: journey.session.state.battle.towers.map(({ id, hitpoints }) => ({ id, hitpoints })),
          hudTick: Number(document.querySelector('[data-ui="hud-projection"]').dataset.tick),
          combatTick: Number(document.querySelector('.combat-frame').dataset.tick),
          renderedCrowns: { north: Number(document.querySelector('[data-ui="hud-crowns"]').dataset.north), south: Number(document.querySelector('[data-ui="hud-crowns"]').dataset.south) },
          destroyedMarkers: [...document.querySelectorAll('.combat-marker--tower[data-destroyed="true"]')].map(n => n.dataset.combatId),
          selected: [...document.querySelectorAll('.hud-card[data-selected="true"]')].map(n => n.dataset.cardId),
          timer: document.querySelector('[data-ui="hud-timer"]').textContent,
          arena: box(document.querySelector('[data-ui="arena"]')),
          cards: [...document.querySelectorAll('[data-ui="card-slot"]')].map(node => ({ id: node.dataset.cardId, selected: node.dataset.selected, text: node.textContent.trim(), label: node.getAttribute("aria-label"), box: box(node) })),
          labels: [...document.querySelectorAll('.hud-card__name')].map(node => ({ text: node.textContent, box: box(node), fontSize: getComputedStyle(node).fontSize, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight })),
          svgPaths: document.querySelectorAll('.combat-art path').length,
          entities: document.querySelectorAll('.combat-marker--entity-ground,.combat-marker--entity-air').length,
          projectile: document.querySelectorAll('.combat-effect-projectile').length,
          impact: document.querySelectorAll('.combat-effect-impact').length,
          debugLines: [...document.querySelectorAll('.combat-target-link,.combat-effect-path')].filter(visible).length,
          text: document.body.innerText.trim() };
      });
      await page.screenshot({ path: `${ARTIFACTS}${name}.png` });
      frames.push({ name, ...evidence });
      assert.equal(evidence.debugLines, 0);
      assert.equal(evidence.hudTick, evidence.tick);
      assert.equal(evidence.combatTick, evidence.tick);
      assert.deepEqual(evidence.renderedCrowns, evidence.crowns);
      assert.deepEqual(evidence.destroyedMarkers.sort(), evidence.towers.filter(t => t.hitpoints === 0).map(t => t.id).sort());
      assert.equal(evidence.cards.length, 4);
      for (const card of evidence.cards) {
        assert.ok(card.box.width >= 44 && card.box.height >= 44);
        assert.ok(card.box.x >= 0 && card.box.x + card.box.width <= 720 && card.box.y + card.box.height <= 1280);
      }
      return evidence;
    };
    await open();
    await capture('00-standard-opening');
    await click(page, '[data-ui="card-slot"]');
    assert.equal((await capture('01-selection')).selected.length, 1);
    await click(page, '[data-ui="arena"]', { x: 270, y: 760 });
    await page.evaluate(() => journey.fastForwardSegment(1));
    assert.ok(await page.evaluate(() => journey.session.replay.some(e => e.type === 'session-deployed' && e.side === 'south')));
    const deployed = await capture('02-legal-deployment');
    assert.ok(deployed.entities > 0 && deployed.svgPaths > 0);
    const found = new Set();
    for (let tick = 0; tick < 900 && !(found.has('projectile') && found.has('impact')); tick += 1) {
      const effect = await page.evaluate(() => {
        journey.fastForwardSegment(1);
        return { projectile: Boolean(document.querySelector('.combat-effect-projectile')), impact: Boolean(document.querySelector('.combat-effect-impact')) };
      });
      for (const [key, name] of [['projectile', '04-projectile'], ['impact', '05-impact']]) {
        if (effect[key] && !found.has(key)) { await capture(name); found.add(key); }
      }
    }
    // Public bounded profile changes tower initial windup to 10,000 ticks and
    // north's legal card to coilblade. It is not standard match balance.
    await open('?session-profile=live-seed-2-terminal');
    await page.evaluate(() => journey.fastForwardSegment(105 - journey.state.sessionTick));
    await click(page, '[data-ui="card-slot"][data-card-id="coilblade"]');
    await click(page, '[data-ui="arena"]', { x: 439, y: 529 });
    await page.evaluate(() => journey.fastForwardSegment(1));
    while (true) {
      const observations = await page.evaluate(() => {
        journey.fastForwardSegment(1);
        const state = journey.session.state;
        const entities = [...document.querySelectorAll('.combat-marker--entity-ground,.combat-marker--entity-air')];
        return { terminal: journey.state.terminal, tick: state.tick,
          bridge: entities.some(n => Math.abs(Number(n.style.getPropertyValue('--combat-y')) - 16000) < 2500) && state.battle.units.some(u => u.targetId != null),
          projectile: Boolean(document.querySelector('.combat-effect-projectile')),
          impact: Boolean(document.querySelector('.combat-effect-impact')),
          destruction: state.battle.towers.some(t => t.hitpoints === 0) };
      });
      for (const [key, name] of [['bridge', '03-bridge-combat'], ['projectile', '04-projectile'], ['impact', '05-impact'], ['destruction', '06-tower-destruction']]) {
        if (observations[key] && !found.has(key)) { await capture(name); found.add(key); }
      }
      if (observations.terminal) break;
      assert.ok(observations.tick < 4000, 'bounded profile must finish');
    }
    assert.deepEqual([...found].sort(), ['bridge', 'destruction', 'impact', 'projectile']);
    await capture('07-terminal-age-0');
    const frozen = await page.evaluate(() => journey.session.serialize());
    for (const [count, age] of [[6, 6], [6, 12], [12, 24]]) {
      await page.evaluate(count => journey.advanceTerminalPresentation(count), count);
      assert.equal(await page.evaluate(() => journey.session.serialize()), frozen);
      await capture(`07-terminal-age-${age}`);
    }
    await click(page, '[data-ui="restart"]');
    assert.equal(await page.evaluate(() => journey.session.serialize()), new GameSession(createShippedGameSessionSetup(0)).serialize());
    await capture('08-restart');
    assert.deepEqual(errors, []);
  } finally {
    writeFileSync(`${ARTIFACTS}evidence.json`, JSON.stringify({ profile: 'standard opening; live-seed-2-terminal bounded combat (10,000 tick tower windup, north coilblade only)', errors, frames }, null, 2));
    await page?.evaluate(() => globalThis.journey?.dispose()).catch(() => {});
    await page?.close();
    server.kill('SIGTERM');
    await browser?.close();
  }
});
