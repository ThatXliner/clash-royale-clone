import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import test from 'node:test';
import { createEditableGameSessionSetup } from '../src/content/editable-deck.js';
import { PLAYABLE_CARD_IDS } from '../src/content/playable-roster.js';
import { GameSession } from '../src/sim/game-session.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const ARTIFACTS = resolve(ROOT, 'artifacts/skymaul-live-sprite-browser');
const CHROME = process.env.GAME_BROWSER_CHROME ?? '';
const { chromium } = await import(process.env.GAME_BROWSER_PLAYWRIGHT ?? 'playwright');
const TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
});
const CASES = Object.freeze([
  Object.freeze({
    name: 'horizontal',
    north: Object.freeze({ x: 10_500, y: 17_001 }),
    south: Object.freeze({ x: 6_000, y: 14_999 }),
    lockedDirections: Object.freeze({ north: 'west', south: 'east' }),
  }),
  Object.freeze({
    name: 'vertical',
    north: Object.freeze({ x: 9_000, y: 20_200 }),
    south: Object.freeze({ x: 9_000, y: 13_800 }),
    lockedDirections: Object.freeze({ north: 'south', south: 'north' }),
  }),
]);
const VIEWPORTS = Object.freeze([
  Object.freeze({ name: 'phone', width: 390, height: 844, bodyCssPixels: 13 }),
  Object.freeze({ name: 'desktop', width: 1_440, height: 933, bodyCssPixels: 26 }),
]);
const MOTIONS = Object.freeze([
  Object.freeze({ name: 'normal', value: 'no-preference' }),
  Object.freeze({ name: 'reduced', value: 'reduce' }),
]);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function directionFor(unit, target) {
  const dx = target.position.x - unit.position.x;
  const dy = target.position.y - unit.position.y;
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy > 0) return 'north';
    if (dy < 0) return 'south';
  }
  if (dx > 0) return 'east';
  if (dx < 0) return 'west';
  return unit.side === 'north' ? 'south' : 'north';
}

function sessionForCase({ north, south, lockedDirections }) {
  const deck = PLAYABLE_CARD_IDS;
  for (let seed = 0; seed < 10_000; seed += 1) {
    const setup = JSON.parse(createEditableGameSessionSetup(deck, seed));
    setup.legalNorthDeployments = [{ cardId: 'skymaul', point: north }];
    setup.thinkIntervalTicks = 3_600;
    setup.thinkOffsetTicks = 0;
    const session = new GameSession(canonical(setup));
    const northSlot = session.state.decks.north.hand.indexOf('skymaul');
    const southSlot = session.state.decks.south.hand.indexOf('skymaul');
    if (northSlot < 0 || southSlot < 0) continue;
    const admission = session.submitPlayerCommand(canonical({
      cardId: 'skymaul',
      commandId: 0,
      point: south,
      slot: southSlot,
      tick: 0,
      type: 'deploy',
    }));
    assert.deepEqual(admission, {
      accepted: true,
      commandId: 0,
      tick: 0,
      type: 'player-command-admitted',
    });
    session.stepMany(1);
    const deployments = session.replay
      .filter(({ type, deployment }) => type === 'session-deployed' && deployment.cardId === 'skymaul')
      .map(({ side, tick }) => ({ side, tick }))
      .sort((left, right) => left.side.localeCompare(right.side));
    const units = session.state.battle.units
      .filter(({ alive, archetypeId }) => alive && archetypeId === 'skymaul');
    const byId = new Map(units.map((unit) => [unit.id, unit]));
    const targetVectors = units.map((unit) => {
      const target = byId.get(unit.targetId);
      return target ? {
        direction: directionFor(unit, target),
        id: unit.id,
        side: unit.side,
        targetId: target.id,
        targetSide: target.side,
      } : null;
    }).filter(Boolean);
    const vectorsBySide = Object.fromEntries(targetVectors.map((vector) => [vector.side, vector]));
    if (deployments.length !== 2 || units.length !== 2 ||
        !vectorsBySide.north || !vectorsBySide.south ||
        vectorsBySide.north.targetId !== vectorsBySide.south.id ||
        vectorsBySide.south.targetId !== vectorsBySide.north.id ||
        vectorsBySide.north.direction !== lockedDirections.north ||
        vectorsBySide.south.direction !== lockedDirections.south) continue;
    return {
      deploymentReceipts: deployments,
      movementTargetWitnesses: vectorsBySide,
      seed,
      sessionBytes: session.serialize(),
      tick: session.state.tick,
    };
  }
  throw new Error(`no bounded seeded Skymaul witness matches ${JSON.stringify(lockedDirections)}`);
}

async function startStaticServer() {
  const missingPaths = [];
  const server = createServer(async (request, response) => {
    const requestedPath = decodeURIComponent(new URL(request.url, 'http://local').pathname);
    if (requestedPath === '/favicon.ico') {
      response.writeHead(204).end();
      return;
    }
    const file = resolve(ROOT, `.${requestedPath}`);
    if (file !== ROOT && !file.startsWith(`${ROOT}${sep}`)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const bytes = await readFile(file);
      response.writeHead(200, {
        'Cache-Control': 'no-store',
        'Content-Length': bytes.length,
        'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
      }).end(bytes);
    } catch {
      missingPaths.push(requestedPath);
      response.writeHead(404).end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    close: () => new Promise((resolveClose, reject) => server.close((error) =>
      error ? reject(error) : resolveClose())),
    missingPaths,
    url: `http://127.0.0.1:${server.address().port}`,
  };
}

async function mountActualSkymaul(page, serverUrl, witness, expectedBodyCssPixels) {
  const response = await page.goto(`${serverUrl}/public/index.html`, {
    waitUntil: 'networkidle',
  });
  assert.equal(response.status(), 200);
  await page.locator('[data-action="begin-battle"]').first().click();
  await page.waitForFunction(() => document.querySelector('.battle-frame') !== null);
  const frame = page.frames().find((candidate) => candidate.url().includes('ui-arena-shell.html'));
  assert.ok(frame, 'the actual app mounted its arena iframe');
  await frame.waitForFunction((expectedPixels) =>
    Number(document.documentElement.dataset.combatBodyCssPixels) === expectedPixels &&
    Number(document.documentElement.dataset.combatFrameScale) > 0,
  expectedBodyCssPixels);
  await frame.waitForSelector('[data-ui="arena"]');
  const mounted = await frame.evaluate(async (sessionBytes) => {
    const [{ arenaHudController }, { GameSession }, { mountShippedGameBrowser }] = await Promise.all([
      import('/src/ui/arena-shell-entry.js'),
      import('/src/sim/game-session.js'),
      import('/src/ui/game-browser-entry.js'),
    ]);
    if (!arenaHudController) throw new Error('actual arena controller is unavailable');
    const session = GameSession.restore(sessionBytes);
    const sourceBytes = session.serialize();
    const stagingRoot = document.createElement('div');
    const staged = mountShippedGameBrowser(stagingRoot, window, session, () => null);
    let browserSnapshot;
    try {
      browserSnapshot = staged.serialize();
    } finally {
      staged.dispose();
    }
    arenaHudController.restore(browserSnapshot);
    if (arenaHudController.session.serialize() !== sourceBytes) {
      throw new Error('actual arena restore changed the canonical Skymaul session bytes');
    }
    if (!arenaHudController.enterManualStepMode()) {
      throw new Error('actual arena did not enter manual stepping');
    }
    globalThis.__skymaulGameController = arenaHudController;
    return {
      bodyCssPixels: Number(document.documentElement.dataset.combatBodyCssPixels),
      frameScale: Number(document.documentElement.dataset.combatFrameScale),
      sessionBytes: sourceBytes,
      sessionTick: arenaHudController.session.state.tick,
      sprites: Array.from(document.querySelectorAll('.combat-marker[data-kind="skymaul"]'),
        (marker) => ({ side: marker.dataset.side, id: marker.dataset.combatId })),
    };
  }, witness.sessionBytes);
  return { frame, ...mounted };
}

async function observeLiveFight(frame, { lockedDirections, maxTicks = 3_600 }) {
  return frame.evaluate(async ({ lockedDirections, maxTicks }) => {
    const controller = globalThis.__skymaulGameController;
    const { createCombatMotionView } = await import('/src/ui/combat-motion.js');
    const towerIds = ['south:central', 'south:lane:west', 'south:lane:east', 'north:central', 'north:lane:west', 'north:lane:east'];
    const targetKey = (id) => Number.isSafeInteger(id) && id >= Number.MAX_SAFE_INTEGER - 5
      ? towerIds[id - (Number.MAX_SAFE_INTEGER - 5)] : id;
    const directionFor = (unit, target) => {
      const dx = target.position.x - unit.position.x;
      const dy = target.position.y - unit.position.y;
      if (Math.abs(dy) >= Math.abs(dx)) {
        if (dy > 0) return 'north';
        if (dy < 0) return 'south';
      }
      if (dx > 0) return 'east';
      if (dx < 0) return 'west';
      return unit.side === 'north' ? 'south' : 'north';
    };
    const fallbackFor = (unit) => unit.side === 'north' ? 'south' : 'north';
    const seenActions = { north: new Set(), south: new Set() };
    const expectedLockWitness = { north: null, south: null };
    const samples = new Map();
    const trace = [];
    const markerGeometry = new Map();
    const bodyCssPixels = Number(document.documentElement.dataset.combatBodyCssPixels);
    const frameScale = Number(document.documentElement.dataset.combatFrameScale);
    let initialDirections = null;
    let checkpoint = null;
    const summarize = (motion, unitsById, targets) => {
      const poses = new Map(motion.poses.map((pose) => [String(pose.id), pose]));
      const markers = Array.from(document.querySelectorAll('.combat-marker[data-kind="skymaul"]'),
        (marker) => {
          const art = marker.querySelector('.combat-art--skymaul');
          const health = marker.querySelector('.combat-health');
          const pose = poses.get(marker.dataset.combatId);
          if (!art || !pose) throw new Error('live Skymaul marker lacks canonical motion art');
          const side = marker.dataset.side;
          const unit = unitsById.get(Number(marker.dataset.combatId));
          if (!unit) throw new Error('live Skymaul marker has no canonical unit record');
          const attackTarget = targets.get(targetKey(unit.attack.targetId));
          if (unit.attack.targetId !== null && !attackTarget) {
            throw new Error('canonical Skymaul attack target is absent from the projection');
          }
          const expectedDirection = attackTarget
            ? directionFor(unit, attackTarget)
            : fallbackFor(unit);
          const team = side === 'north' ? 'ember' : 'river';
          const columns = { east: 0, north: 1, south: 2, west: 3 };
          const rows = {
            north: { idle: 3, walk: 4, contact: 5 },
            south: { idle: 0, walk: 1, contact: 2 },
          };
          const action = pose.spriteAction;
          const direction = pose.spriteDirection;
          const [x, y, width, height] = art.getAttribute('viewBox').split(/[ ,]+/u).map(Number);
          const markerRect = marker.getBoundingClientRect();
          const artRect = art.getBoundingClientRect();
          const healthRect = health.getBoundingClientRect();
          const artStyle = getComputedStyle(art);
          if (art.dataset.spriteAction !== action || art.dataset.spriteDirection !== direction ||
              art.dataset.spriteSide !== side || art.dataset.spriteTeam !== team ||
              art.dataset.simulationTick !== String(motion.tick) ||
              art.dataset.reducedMotion !== String(matchMedia('(prefers-reduced-motion: reduce)').matches) ||
              x !== columns[direction] * 64 || y !== rows[side][action] * 64 || width !== 64 || height !== 64 ||
              art.dataset.pivot !== '32:54' || artStyle.pointerEvents !== 'none' || !health) {
            throw new Error(`Skymaul atlas binding disagrees with canonical tick ${motion.tick}`);
          }
          if (direction !== expectedDirection) {
            throw new Error(`Skymaul facing disagrees with attack target/fallback at tick ${motion.tick}: ` +
              `${side} expected ${expectedDirection}, received ${direction}`);
          }
          const cssFrameWidth = Number.parseFloat(art.style.width);
          if (!Number.isFinite(cssFrameWidth) ||
              Math.abs(cssFrameWidth * frameScale - 64 * bodyCssPixels / 13) > 0.01) {
            throw new Error('Skymaul sprite frame does not retain the 13/26px presentation scale');
          }
          const geometry = {
            healthHeight: healthRect.height,
            markerHeight: markerRect.height,
            markerWidth: markerRect.width,
          };
          const priorGeometry = markerGeometry.get(side);
          if (priorGeometry !== undefined &&
              Object.keys(geometry).some((key) => Math.abs(geometry[key] - priorGeometry[key]) > 0.01)) {
            throw new Error(`Skymaul pose changed canonical ${side} marker or health geometry`);
          }
          markerGeometry.set(side, geometry);
          const sample = {
            action,
            attackPhase: unit.attack.phase,
            attackTargetId: unit.attack.targetId,
            canonicalPose: pose.pose,
            direction,
            expectedDirection,
            frame: art.dataset.spriteFrame,
            height: artRect.height,
            id: marker.dataset.combatId,
            kind: marker.dataset.kind,
            markerHeight: markerRect.height,
            markerWidth: markerRect.width,
            pivotErrorX: artRect.left + artRect.width / 2 -
              (markerRect.left + markerRect.width / 2),
            pivotErrorY: artRect.top + artRect.height * 0.84375 -
              (markerRect.top + markerRect.height / 2),
            pointerEvents: artStyle.pointerEvents,
            side,
            team,
            tick: motion.tick,
            viewBox: art.getAttribute('viewBox'),
            width: artRect.width,
            healthClass: health.className,
            healthHeight: healthRect.height,
            healthWidth: healthRect.width,
            markerInlineSize: marker.style.width,
          };
          seenActions[side].add(action);
          if (unit.attack.targetId !== null && direction === lockedDirections[side] &&
              expectedLockWitness[side] === null) {
            expectedLockWitness[side] = {
              direction,
              targetArchetypeId: attackTarget.archetypeId ?? null,
              targetSide: attackTarget.side ?? null,
              targetId: unit.attack.targetId,
              tick: motion.tick,
            };
          }
          samples.set(`${side}:${direction}:${action}`, sample);
          return sample;
        });
      return markers;
    };

    for (let index = 0; index < maxTicks; index += 1) {
      controller.stepMany(1);
      const snapshot = controller.session.projectionSnapshot();
      const motion = createCombatMotionView(snapshot);
      const battle = snapshot.state.battle;
      const unitsById = new Map(battle.units.map((unit) => [unit.id, unit]));
      const targets = new Map([...battle.towers, ...battle.units]
        .map((record) => [record.id, record]));
      const markers = summarize(motion, unitsById, targets);
      if (motion.tick !== controller.session.state.tick || markers.length !== 2) {
        throw new Error('canonical Skymaul motion and displayed marker ticks diverged');
      }
      if (initialDirections === null) {
        initialDirections = Object.fromEntries(markers.map((marker) => [marker.side, marker.direction]));
        if (markers.some(({ attackTargetId, attackPhase }) =>
          attackTargetId !== null || attackPhase !== 'deploying')) {
          throw new Error('initial Skymaul checkpoint is not the canonical targetless deployment phase');
        }
      }
      trace.push({ tick: motion.tick, sprites: markers.map(({
        side, direction, action, frame, viewBox, attackPhase, attackTargetId,
      }) => ({ side, direction, action, frame, viewBox, attackPhase, attackTargetId })) });
      if (Object.values(seenActions).every((actions) =>
        ['idle', 'walk', 'contact'].every((action) => actions.has(action))) &&
          Object.values(expectedLockWitness).every((witness) => witness !== null)) {
        checkpoint = {
          browserBytes: controller.serialize(),
          sessionBytes: controller.session.serialize(),
          markers,
          tick: motion.tick,
        };
        break;
      }
      if (index % 90 === 89) {
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      }
    }
    if (checkpoint === null) {
      throw new Error(`actual Skymaul battle did not show all fixed poses by ${maxTicks} ticks`);
    }
    return {
      checkpoint,
      bodyCssPixels,
      frameScale,
      initialDirections,
      expectedLockWitness,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
      seenActions: Object.fromEntries(Object.entries(seenActions)
        .map(([side, actions]) => [side, [...actions].sort()])),
      samples: [...samples.values()].sort((left, right) =>
        left.side.localeCompare(right.side) || left.direction.localeCompare(right.direction) ||
        left.action.localeCompare(right.action)),
      trace,
    };
  }, { lockedDirections, maxTicks });
}

async function currentContinuation(frame) {
  return frame.evaluate(async () => {
    const controller = globalThis.__skymaulGameController;
    const { createCombatMotionView } = await import('/src/ui/combat-motion.js');
    const motion = createCombatMotionView(controller.session.projectionSnapshot());
    const markers = Array.from(document.querySelectorAll('.combat-marker[data-kind="skymaul"]'),
      (marker) => {
        const art = marker.querySelector('.combat-art--skymaul');
        const health = marker.querySelector('.combat-health');
        const rect = marker.getBoundingClientRect();
        return {
          action: art?.dataset.spriteAction ?? null,
          direction: art?.dataset.spriteDirection ?? null,
          frame: art?.dataset.spriteFrame ?? null,
          health: health?.className ?? null,
          healthHeight: health?.getBoundingClientRect().height ?? null,
          healthWidth: health?.getBoundingClientRect().width ?? null,
          id: marker.dataset.combatId,
          markerHeight: rect.height,
          markerWidth: rect.width,
          side: marker.dataset.side,
          tick: art?.dataset.simulationTick ?? null,
          viewBox: art?.getAttribute('viewBox') ?? null,
        };
      });
    return {
      browserBytes: controller.serialize(),
      motionTick: motion.tick,
      sessionBytes: controller.session.serialize(),
      sessionTick: controller.session.state.tick,
      markers,
    };
  });
}

test('actual Skymaul GameSession binds fixed poses and restores the same future at phone and desktop sizes', {
  timeout: 180_000,
}, async (t) => {
  mkdirSync(ARTIFACTS, { recursive: true });
  const server = await startStaticServer();
  t.after(() => server.close());
  const browser = await chromium.launch({
    executablePath: CHROME && existsSync(CHROME) ? CHROME : undefined,
    headless: true,
  });
  t.after(() => browser.close());
  const missingAtEnd = [];
  const report = [];

  for (const scenario of CASES) {
    const witness = sessionForCase(scenario);
    for (const viewport of VIEWPORTS) {
      let normalTrace = null;
      for (const motion of MOTIONS) {
        const context = await browser.newContext({
          colorScheme: 'dark',
          deviceScaleFactor: 1,
          reducedMotion: motion.value,
          viewport: { width: viewport.width, height: viewport.height },
        });
        const page = await context.newPage();
        const errors = [];
        const atlasRequests = [];
        page.on('pageerror', (error) => errors.push(String(error)));
        page.on('requestfailed', (request) => errors.push(
          `${request.url()}: ${request.failure()?.errorText ?? 'failed'}`,
        ));
        page.on('request', (request) => {
          if (request.url().includes('skymaul-battle-sprite.png')) atlasRequests.push(request.url());
        });
        const missingStart = server.missingPaths.length;
        const { frame, ...mounted } = await mountActualSkymaul(
          page, server.url, witness, viewport.bodyCssPixels,
        );
        assert.equal(mounted.sessionBytes, witness.sessionBytes);
        assert.equal(mounted.sessionTick, witness.tick);
        assert.equal(mounted.bodyCssPixels, viewport.bodyCssPixels);
        assert.ok(mounted.frameScale > 0);
        assert.deepEqual(mounted.sprites.map(({ side }) => side).sort(), ['north', 'south']);

        const observed = await observeLiveFight(frame, { lockedDirections: scenario.lockedDirections });
        assert.equal(observed.reducedMotion, motion.name === 'reduced');
        assert.equal(observed.frameScale, mounted.frameScale);
        assert.deepEqual(observed.initialDirections, { north: 'south', south: 'north' },
          'deployment-facing uses the canonical fallback while both attack cycles are targetless');
        assert.deepEqual(Object.fromEntries(Object.entries(observed.expectedLockWitness)
          .map(([side, witness]) => [side, witness.direction])), scenario.lockedDirections,
        'horizontal and vertical headings are observed only after a canonical attack-target lock');
        for (const witness of Object.values(observed.expectedLockWitness)) {
          assert.ok(witness.tick > mounted.sessionTick);
          assert.notEqual(witness.targetId, null);
        }
        const unitIdsBySide = Object.fromEntries(mounted.sprites
          .map(({ side, id }) => [side, Number(id)]));
        for (const [side, witness] of Object.entries(observed.expectedLockWitness)) {
          const opposingSide = side === 'north' ? 'south' : 'north';
          assert.equal(witness.targetId, unitIdsBySide[opposingSide],
            'facing witness is locked to the opposing Skymaul');
          assert.equal(witness.targetSide, opposingSide);
          assert.equal(witness.targetArchetypeId, 'skymaul');
        }
        assert.deepEqual(observed.seenActions, {
          north: ['contact', 'idle', 'walk'],
          south: ['contact', 'idle', 'walk'],
        });
        assert.ok(observed.samples.length >= 6);
        for (const sample of observed.samples) {
          assert.equal(sample.kind, 'skymaul');
          assert.equal(sample.markerInlineSize, '', 'sprite sizing leaves canonical marker sizing to CSS');
          assert.equal(sample.healthClass, 'combat-health', 'health bar remains attached to the marker');
          assert.equal(sample.pointerEvents, 'none');
          if (sample.canonicalPose === 'idle') {
            assert.ok(Math.abs(sample.pivotErrorX) < 0.01);
            assert.ok(Math.abs(sample.pivotErrorY) < 0.01);
          }
        }

        const stem = `${scenario.name}-${viewport.name}-${motion.name}`;
        const checkpointPng = resolve(ARTIFACTS, `${stem}-checkpoint.png`);
        await page.screenshot({ path: checkpointPng, animations: 'disabled' });
        const checkpoint = observed.checkpoint;
        await frame.evaluate((browserBytes) => {
          const controller = globalThis.__skymaulGameController;
          controller.restore(browserBytes);
          if (controller.state.running || controller.state.scheduled) {
            throw new Error('restore resumed automatic stepping');
          }
        }, checkpoint.browserBytes);
        const afterRestore = await currentContinuation(frame);
        const restoredPng = resolve(ARTIFACTS, `${stem}-restored.png`);
        await page.screenshot({ path: restoredPng, animations: 'disabled' });
        const checkpointPixels = await readFile(checkpointPng);
        const restoredPixels = await readFile(restoredPng);
        assert.equal(afterRestore.browserBytes, checkpoint.browserBytes);
        assert.equal(afterRestore.sessionBytes, checkpoint.sessionBytes);
        assert.equal(afterRestore.sessionTick, checkpoint.tick);
        assert.equal(afterRestore.motionTick, checkpoint.tick);
        assert.deepEqual(afterRestore.markers, checkpoint.markers.map((marker) => ({
          action: marker.action,
          direction: marker.direction,
          frame: marker.frame,
          health: marker.healthClass,
          healthHeight: marker.healthHeight,
          healthWidth: marker.healthWidth,
          id: marker.id,
          markerHeight: marker.markerHeight,
          markerWidth: marker.markerWidth,
          side: marker.side,
          tick: String(marker.tick),
          viewBox: marker.viewBox,
        })));
        assert.ok(checkpointPixels.equals(restoredPixels),
          'actual arena screenshot is pixel-identical after canonical session restore');

        const futureTicks = 120;
        await frame.evaluate((ticks) => globalThis.__skymaulGameController.stepMany(ticks), futureTicks);
        const futureReference = await currentContinuation(frame);
        assert.equal(futureReference.sessionTick, checkpoint.tick + futureTicks,
          'manual stepMany advances exactly 120 ticks after restoring the checkpoint');
        await frame.evaluate((browserBytes) => {
          const controller = globalThis.__skymaulGameController;
          controller.restore(browserBytes);
          if (controller.state.running || controller.state.scheduled) {
            throw new Error('future restore resumed automatic stepping');
          }
        }, checkpoint.browserBytes);
        await frame.evaluate((ticks) => globalThis.__skymaulGameController.stepMany(ticks), futureTicks);
        const futureReplay = await currentContinuation(frame);
        assert.equal(futureReplay.browserBytes, futureReference.browserBytes);
        assert.equal(futureReplay.sessionBytes, futureReference.sessionBytes);
        assert.equal(futureReplay.sessionTick, futureReference.sessionTick);
        assert.deepEqual(futureReplay.markers, futureReference.markers,
          'restored future reproduces exact Skymaul frame, facing, health anchor, and tick');

        const trace = observed.trace.map(({ tick, sprites }) => ({ tick, sprites }));
        if (motion.name === 'normal') normalTrace = trace;
        else assert.deepEqual(trace, normalTrace,
          'normal and reduced motion select the same static cells at every canonical tick');
        report.push({
          bodyCssPixels: mounted.bodyCssPixels,
          case: scenario.name,
          checkpoint: {
            browserBytesSha256: createHash('sha256').update(checkpoint.browserBytes).digest('hex'),
            sessionBytesSha256: createHash('sha256').update(checkpoint.sessionBytes).digest('hex'),
            tick: checkpoint.tick,
          },
          expectedLockWitness: observed.expectedLockWitness,
          lockedDirections: scenario.lockedDirections,
          future: {
            sessionBytesSha256: createHash('sha256').update(futureReference.sessionBytes).digest('hex'),
            sessionTick: futureReference.sessionTick,
            ticks: futureTicks,
          },
          frameScale: mounted.frameScale,
          initialSessionSha256: createHash('sha256').update(witness.sessionBytes).digest('hex'),
          motion: motion.name,
          sampleFrames: observed.samples,
          screenshot: checkpointPng,
          screenshotSha256: createHash('sha256').update(checkpointPixels).digest('hex'),
          seed: witness.seed,
          trace,
          viewport: { width: viewport.width, height: viewport.height },
        });
        assert.ok(atlasRequests.length > 0, 'the live renderer requests the accepted atlas');
        assert.deepEqual(errors, []);
        assert.deepEqual(server.missingPaths.slice(missingStart), []);
        await page.close();
        await context.close();
      }
    }
  }
  missingAtEnd.push(...server.missingPaths);
  assert.deepEqual(missingAtEnd, []);
  const lockedFacingCoverage = new Set(report.flatMap(({ expectedLockWitness }) =>
    Object.values(expectedLockWitness).map(({ direction }) => direction)));
  assert.deepEqual([...lockedFacingCoverage].sort(), ['east', 'north', 'south', 'west'],
    'the two real fights demonstrate all four attack-locked facings');
  writeFileSync(resolve(ARTIFACTS, 'live-report.json'), `${JSON.stringify(report, null, 2)}\n`);
});
