import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const CANDIDATE = '/Users/me/.codex/clash-qualification/20261020-copperskiff-readability-r3/candidate';
const PROTOTYPES = '/Users/me/.codex/clash-qualification/20261020-copperskiff-readability-r3/prototypes';
const OUTPUT = "/Users/me/.codex/clash-qualification/20261020-copperskiff-readability-r3/critic-r3/native-context-ab";
const CHROME = process.env.GAME_BROWSER_CHROME;
const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT;
assert.ok(CHROME, 'GAME_BROWSER_CHROME must name the approved Chrome binary');
assert.ok(PLAYWRIGHT, 'GAME_BROWSER_PLAYWRIGHT must name the pinned Playwright module');

const { chromium } = await import(PLAYWRIGHT);
const { createEditableGameSessionSetup } = await import(pathToFileURL(
  resolve(CANDIDATE, 'src/content/editable-deck.js'),
).href);
const { createPlayableRoster, PLAYABLE_CARD_IDS } = await import(pathToFileURL(
  resolve(CANDIDATE, 'src/content/playable-roster.js'),
).href);
const { GameSession } = await import(pathToFileURL(
  resolve(CANDIDATE, 'src/sim/game-session.js'),
).href);

const variants = [
  ['A', 'A-current-r2.png'],
  ['B', 'B-crisp-center-sample.png'],
  ['C', 'C-crisp-center-plus-1px-ink-outline.png'],
].map(([label, name]) => ({
  label,
  path: resolve(PROTOTYPES, name),
}));
const viewports = [
  { name: 'phone', width: 390, height: 844, bodyCssPixels: 13 },
  { name: 'desktop', width: 1_440, height: 933, bodyCssPixels: 26 },
];
const cases = [
  { name: 'horizontal', north: { x: 10_500, y: 17_001 }, south: { x: 6_000, y: 14_999 } },
];
const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sessionForCase({ north, south }) {
  for (let seed = 0; seed < 1_000; seed += 1) {
    const setup = JSON.parse(createEditableGameSessionSetup(PLAYABLE_CARD_IDS, seed));
    setup.legalNorthDeployments = [{ cardId: 'copperskiff', point: north }];
    setup.thinkIntervalTicks = 1;
    setup.thinkOffsetTicks = 0;
    const session = new GameSession(canonical(setup));
    const northSlot = session.state.decks.north.hand.indexOf('copperskiff');
    const southSlot = session.state.decks.south.hand.indexOf('copperskiff');
    if (northSlot < 0 || southSlot < 0) continue;
    const admission = session.submitPlayerCommand(canonical({
      cardId: 'copperskiff', commandId: 0, point: south, slot: southSlot, tick: 0, type: 'deploy',
    }));
    assert.deepEqual(admission, {
      accepted: true, commandId: 0, tick: 0, type: 'player-command-admitted',
    });
    session.stepMany(1);
    const deployedSides = session.replay
      .filter((event) => event.type === 'session-deployed' && event.deployment.cardId === 'copperskiff')
      .map(({ side }) => side).sort();
    assert.deepEqual(deployedSides, ['north', 'south']);
    return { seed, sessionBytes: session.serialize() };
  }
  throw new Error('no bounded seeded opening hand contains Copperskiff');
}

const serverMissingPaths = [];
async function startStaticServer(variantBytes) {
  const server = createServer(async (request, response) => {
    const requestedPath = decodeURIComponent(new URL(request.url, 'http://local').pathname);
    if (requestedPath === '/favicon.ico') return response.writeHead(204).end();
    if (requestedPath === '/public/assets/copperskiff-battle-sprite.png') {
      return response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Length': variantBytes.length,
        'Content-Type': 'image/png',
        'X-Content-Type-Options': 'nosniff',
      }).end(variantBytes);
    }
    const file = resolve(CANDIDATE, `.${requestedPath}`);
    if (file !== CANDIDATE && !file.startsWith(`${CANDIDATE}${sep}`)) {
      return response.writeHead(403).end();
    }
    try {
      const bytes = await readFile(file);
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Length': bytes.length,
        'Content-Type': MIME[extname(file)] ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      }).end(bytes);
    } catch {
      serverMissingPaths.push(requestedPath);
      response.writeHead(404).end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    close: () => new Promise((resolveClose, reject) => server.close((error) =>
      error ? reject(error) : resolveClose())),
    url: `http://127.0.0.1:${server.address().port}`,
  };
}

async function openBattle(page, serverUrl, bodyCssPixels) {
  const response = await page.goto(`${serverUrl}/public/index.html`, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  await page.locator('[data-action="begin-battle"]').first().click();
  await page.waitForFunction(() => document.querySelector('.battle-frame') !== null);
  const frame = page.frames().find((candidate) => candidate.url().includes('ui-arena-shell.html'));
  assert.ok(frame, 'actual app mounted its arena iframe');
  await frame.waitForFunction((expected) =>
    Number(document.documentElement.dataset.combatBodyCssPixels) === expected &&
    Number(document.documentElement.dataset.combatFrameScale) > 0, bodyCssPixels);
  return frame;
}

async function mountActualGame(frame, sessionBytes) {
  return frame.evaluate(async ({ sessionBytes }) => {
    const [{ arenaHudController }, { GameSession }, { mountShippedGameBrowser }] = await Promise.all([
      import('/src/ui/arena-shell-entry.js'),
      import('/src/sim/game-session.js'),
      import('/src/ui/game-browser-entry.js'),
    ]);
    const session = GameSession.restore(sessionBytes);
    const sourceBytes = session.serialize();
    const stagingRoot = document.createElement('div');
    const staged = mountShippedGameBrowser(stagingRoot, window, session, () => null);
    let browserSnapshot;
    try {
      if (!staged.state.running) throw new Error('staged actual game is not running');
      browserSnapshot = staged.serialize();
    } finally {
      staged.dispose();
    }
    if (JSON.parse(browserSnapshot).session !== sourceBytes) {
      throw new Error('staged actual browser did not preserve source session bytes');
    }
    arenaHudController.restore(browserSnapshot);
    if (arenaHudController.session.serialize() !== sourceBytes) {
      throw new Error('actual arena restore changed source session bytes');
    }
    if (!arenaHudController.enterManualStepMode()) {
      throw new Error('actual arena did not enter manual-step mode');
    }
    globalThis.__copperskiffGameController = arenaHudController;
    return {
      bodyCssPixels: Number(document.documentElement.dataset.combatBodyCssPixels),
      sourceSessionBytes: sourceBytes.length,
      tick: arenaHudController.session.state.tick,
      unitSides: arenaHudController.session.state.battle.units
        .filter((unit) => unit.alive && unit.cardId === 'copperskiff').map((unit) => unit.side).sort(),
    };
  }, { sessionBytes });
}

async function stepToContact(frame) {
  return frame.evaluate(async () => {
    const controller = globalThis.__copperskiffGameController;
    const { createCombatMotionView } = await import('/src/ui/combat-motion.js');
    const initialHp = new Map(controller.session.state.battle.units
      .filter((unit) => unit.archetypeId === 'copperskiff')
      .map((unit) => [String(unit.id), unit.hitpoints]));
    const damagedSides = new Set();
    const canonicalContactSides = new Set();
    let checkpoint = null;
    for (let tick = 0; tick < 3_600; tick += 1) {
      controller.stepMany(1);
      const projection = controller.session.projectionSnapshot();
      const motion = createCombatMotionView(projection);
      const unitsById = new Map(projection.state.battle.units.map((unit) => [String(unit.id), unit]));
      for (const unit of projection.state.battle.units) {
        const hp = initialHp.get(String(unit.id));
        if (unit.archetypeId === 'copperskiff' && hp !== undefined && unit.hitpoints < hp) {
          damagedSides.add(unit.side);
        }
      }
      const current = new Set();
      for (const pose of motion.poses) {
        const unit = unitsById.get(String(pose.id));
        if (unit?.archetypeId === 'copperskiff' && ['attack', 'recoil'].includes(pose.pose)) {
          canonicalContactSides.add(unit.side);
          current.add(unit.side);
        }
      }
      const vectors = projection.state.battle.units
        .filter((unit) => unit.alive && unit.archetypeId === 'copperskiff')
        .map((unit) => {
          const target = unitsById.get(String(unit.targetId));
          return target === undefined ? null : {
            id: unit.id,
            side: unit.side,
            targetId: unit.targetId,
            targetSide: target.side,
            axis: Math.abs(target.position.x - unit.position.x) >
              Math.abs(target.position.y - unit.position.y) ? 'x' : 'y',
          };
        }).filter(Boolean);
      const north = vectors.find(({ side }) => side === 'north');
      const south = vectors.find(({ side }) => side === 'south');
      const mutualTargets = north !== undefined && south !== undefined &&
        north.targetId === south.id && north.targetSide === 'south' &&
        south.targetId === north.id && south.targetSide === 'north';
      if (mutualTargets && vectors.every(({ axis }) => axis === 'x') &&
          canonicalContactSides.size === 2 && current.size > 0 && damagedSides.size === 2) {
        checkpoint = { tick: controller.session.state.tick, vectors, damagedSides: [...damagedSides].sort() };
        break;
      }
      if (tick % 60 === 59) await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    }
    if (checkpoint === null) throw new Error('actual battle did not reach the horizontal Copperskiff contact checkpoint');
    await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
    const markers = Array.from(document.querySelectorAll('.combat-marker[data-kind="copperskiff"]'), (marker) => {
      const markerBounds = marker.getBoundingClientRect();
      const art = marker.querySelector('.combat-art--copperskiff');
      const artBounds = art?.getBoundingClientRect();
      return {
        action: art?.dataset.spriteAction ?? null,
        direction: art?.dataset.spriteDirection ?? null,
        frame: art?.dataset.spriteFrame ?? null,
        marker: { left: markerBounds.left, top: markerBounds.top, width: markerBounds.width, height: markerBounds.height },
        art: artBounds ? { left: artBounds.left, top: artBounds.top, width: artBounds.width, height: artBounds.height } : null,
        side: marker.dataset.side ?? null,
      };
    });
    return { ...checkpoint, markers };
  });
}

await mkdir(OUTPUT, { recursive: true });
const witness = sessionForCase(cases[0]);
const records = [];
const browser = await chromium.launch({ headless: true, executablePath: CHROME });
try {
  for (const variant of variants) {
    const variantBytes = await readFile(variant.path);
    const variantSha256 = createHash('sha256').update(variantBytes).digest('hex');
    const server = await startStaticServer(variantBytes);
    try {
      for (const viewport of viewports) {
        const context = await browser.newContext({
          colorScheme: 'dark', deviceScaleFactor: 1, reducedMotion: 'no-preference',
          viewport: { width: viewport.width, height: viewport.height },
        });
        const page = await context.newPage();
        const pageErrors = [];
        page.on('pageerror', (error) => pageErrors.push(String(error)));
        const frame = await openBattle(page, server.url, viewport.bodyCssPixels);
        const mount = await mountActualGame(frame, witness.sessionBytes);
        assert.equal(mount.bodyCssPixels, viewport.bodyCssPixels);
        assert.deepEqual(mount.unitSides, ['north', 'south']);
        const contact = await stepToContact(frame);
        await page.mouse.move(0, 0);
        await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
        const output = resolve(OUTPUT, `${variant.label}-${viewport.name}-390x844.png`)
          .replace('-390x844', `-${viewport.width}x${viewport.height}`);
        await page.screenshot({ path: output, animations: 'disabled' });
        const screenshotBytes = await readFile(output);
        records.push({
          browserErrors: pageErrors,
          contact,
          mount,
          screenshot: {
            byteLength: screenshotBytes.length,
            path: output,
            sha256: createHash('sha256').update(screenshotBytes).digest('hex'),
          },
          variant: { label: variant.label, path: variant.path, sha256: variantSha256 },
          viewport,
        });
        await page.close();
        await context.close();
      }
    } finally {
      await server.close();
    }
  }
} finally {
  await browser.close();
}

assert.deepEqual(serverMissingPaths, [], 'actual context capture has no missing local assets');
assert.ok(records.every((record) => record.browserErrors.length === 0));
const report = {
  purpose: 'diagnostic A/B/C rendering in the actual game at 1x phone and desktop viewports; not a release qualification',
  session: { seed: witness.seed, scenario: cases[0].name, serializedBytes: witness.sessionBytes.length },
  records,
  missingPaths: serverMissingPaths,
};
const reportPath = resolve(OUTPUT, 'capture-report.json');
const reportBytes = `${JSON.stringify(report, null, 2)}\n`;
await writeFile(reportPath, reportBytes, { flag: 'wx' });
console.log(JSON.stringify({ reportPath, records: records.map(({ variant, viewport, contact, screenshot }) => ({
  variant: variant.label, viewport: viewport.name, contactTick: contact.tick,
  markers: contact.markers.map(({ side, direction, action }) => ({ side, direction, action })),
  screenshot: screenshot.path,
  sha256: screenshot.sha256,
})) }, null, 2));
