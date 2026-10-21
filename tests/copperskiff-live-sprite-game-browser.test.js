import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import test from 'node:test';
import { createEditableGameSessionSetup } from '../src/content/editable-deck.js';
import { createPlayableRoster, PLAYABLE_CARD_IDS } from '../src/content/playable-roster.js';
import { GameSession } from '../src/sim/game-session.js';

const TEST_PID_FILE = process.env.GAME_BROWSER_TEST_PID_FILE;
if (TEST_PID_FILE !== undefined) {
  writeFileSync(TEST_PID_FILE, `${process.pid}\n`, { flag: 'wx' });
}

const ARTIFACT_ATTEMPT_ID = process.env.GAME_BROWSER_ARTIFACT_ATTEMPT_ID ?? randomUUID();
if (!/^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/u.test(ARTIFACT_ATTEMPT_ID)) {
  throw new Error('GAME_BROWSER_ARTIFACT_ATTEMPT_ID must be a unique safe path segment');
}

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const ARTIFACTS_BASE = resolve(ROOT, 'artifacts/app-redesign-copper-001-builder/browser/actual-game');
const ARTIFACTS = resolve(ARTIFACTS_BASE, `attempt-${ARTIFACT_ATTEMPT_ID}`);
if (process.env.GAME_BROWSER_ARTIFACTS_PREALLOCATED === '1') {
  if (readdirSync(ARTIFACTS).length !== 0) {
    throw new Error(`fresh actual-game artifact directory is not empty: ${ARTIFACTS}`);
  }
} else {
  mkdirSync(ARTIFACTS_BASE, { recursive: true });
  mkdirSync(ARTIFACTS);
}

const { chromium } = await import(process.env.GAME_BROWSER_PLAYWRIGHT ?? 'playwright');

const ONE_CASE_PROBE = process.env.GAME_BROWSER_ONE_CASE_PROBE === '1';
const SINGLE_CASE_FULL_ASSERTIONS =
  process.env.GAME_BROWSER_SINGLE_CASE_FULL_ASSERTIONS === '1';
const VISUAL_DOM_DIAGNOSTICS =
  process.env.GAME_BROWSER_VISUAL_DOM_DIAGNOSTICS === '1';
const SINGLE_CASE = ONE_CASE_PROBE || SINGLE_CASE_FULL_ASSERTIONS;
const CHROME = process.env.GAME_BROWSER_CHROME ?? '';
const DECK = PLAYABLE_CARD_IDS;
const CARDS_BY_ID = new Map(createPlayableRoster().map((card) => [card.id, card]));
const ENVIRONMENT_ALLOWLIST = Object.freeze([
  'GAME_BROWSER_ARTIFACT_ATTEMPT_ID',
  'GAME_BROWSER_ARTIFACTS_PREALLOCATED',
  'GAME_BROWSER_CHROME',
  'GAME_BROWSER_NODE',
  'GAME_BROWSER_PLAYWRIGHT',
  'GAME_BROWSER_TEST_PID_FILE',
  'GAME_BROWSER_ONE_CASE_PROBE',
  'GAME_BROWSER_SINGLE_CASE_FULL_ASSERTIONS',
  'GAME_BROWSER_VISUAL_DOM_DIAGNOSTICS',
  'PATH',
]);
const CASES = Object.freeze([
  Object.freeze({
    name: 'horizontal',
    north: Object.freeze({ x: 10_500, y: 17_001 }),
    south: Object.freeze({ x: 6_000, y: 14_999 }),
    expected: Object.freeze({ north: 'west', south: 'east' }),
    expectedTargetAxis: 'x',
  }),
  Object.freeze({
    name: 'vertical',
    north: Object.freeze({ x: 9_000, y: 17_500 }),
    south: Object.freeze({ x: 9_000, y: 14_500 }),
    expected: Object.freeze({ north: 'south', south: 'north' }),
    expectedTargetAxis: 'y',
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
const PRIOR_DESKTOP_PIXEL_DIFF_BOUNDS = Object.freeze({
  bottom: 896,
  left: 561,
  right: 710,
  top: 719,
});
const TYPES = Object.freeze({
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
});

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function summarizeSession(session) {
  const serialized = session.serialize();
  const state = session.state;
  const deploymentReceipts = session.replay
    .filter((event) => event.type === 'session-deployed')
    .map(({ deployment, side, tick }) => ({
      cardId: deployment.cardId,
      entityIds: deployment.entityIds,
      point: deployment.point,
      side,
      tick,
    }));
  const units = state.battle.units.map((unit) => ({
    alive: unit.alive,
    cardId: unit.cardId ?? null,
    hitpoints: unit.hitpoints,
    id: unit.id,
    kind: unit.archetypeId ?? null,
    position: unit.position,
    side: unit.side,
    targetId: unit.targetId ?? null,
  }));
  const unitsById = new Map(units.map((unit) => [unit.id, unit]));
  const targetVectors = units
    .filter((unit) => unit.alive && unit.cardId === 'copperskiff')
    .map((unit) => {
      const target = unitsById.get(unit.targetId);
      if (target === undefined) {
        return {
          from: unit.position,
          id: unit.id,
          side: unit.side,
          targetId: unit.targetId,
          targetPosition: null,
          targetSide: null,
          dx: null,
          dy: null,
          dominantAxis: null,
        };
      }
      const dx = target.position.x - unit.position.x;
      const dy = target.position.y - unit.position.y;
      return {
        from: unit.position,
        id: unit.id,
        side: unit.side,
        targetId: unit.targetId,
        targetPosition: target.position,
        targetSide: target.side,
        dx,
        dy,
        dominantAxis: Math.abs(dx) > Math.abs(dy) ? 'x'
          : Math.abs(dy) > Math.abs(dx) ? 'y' : 'tie',
      };
    });
  return {
    deploymentReceipts,
    pendingPlayerCommands: state.pendingPlayerCommands,
    sha256: createHash('sha256').update(serialized).digest('hex'),
    tick: state.tick,
    targetVectors,
    units,
  };
}

function sessionForCase({ north, south }) {
  for (let seed = 0; seed < 1_000; seed += 1) {
    const setup = JSON.parse(createEditableGameSessionSetup(DECK, seed));
    setup.legalNorthDeployments = [{ cardId: 'copperskiff', point: north }];
    setup.thinkIntervalTicks = 1;
    setup.thinkOffsetTicks = 0;
    const session = new GameSession(canonical(setup));
    const northSlot = session.state.decks.north.hand.indexOf('copperskiff');
    const slot = session.state.decks.south.hand.indexOf('copperskiff');
    if (northSlot < 0 || slot < 0) continue;
    const openingHands = {
      north: [...session.state.decks.north.hand],
      south: [...session.state.decks.south.hand],
    };
    const admission = session.submitPlayerCommand(canonical({
      cardId: 'copperskiff',
      commandId: 0,
      point: south,
      slot,
      tick: 0,
      type: 'deploy',
    }));
    assert.deepEqual(admission, {
      accepted: true,
      commandId: 0,
      tick: 0,
      type: 'player-command-admitted',
    }, 'the serialized actual-game witness must contain an admitted south Copperskiff');
    session.stepMany(1);
    const sourceSummary = summarizeSession(session);
    const deployedSides = sourceSummary.deploymentReceipts
      .filter(({ cardId }) => cardId === 'copperskiff')
      .map(({ side }) => side)
      .sort();
    assert.deepEqual(deployedSides, ['north', 'south'],
      'the authentic tick-0 opponent and player paths must deploy both canonical Copperskiffs');
    assert.deepEqual(sourceSummary.units
      .filter((unit) => unit.alive && unit.cardId === 'copperskiff')
      .map(({ side }) => side)
      .sort(), ['north', 'south'],
    'the source GameSession must contain both live canonical owners before browser restore');
    return {
      admission,
      sessionBytes: session.serialize(),
      setupWitness: {
        legalNorthDeployments: setup.legalNorthDeployments,
        openingHands,
        seed,
      },
      sourceSummary,
    };
  }
  throw new Error('no bounded seeded opening hand contains Copperskiff');
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

async function openActualBattle(page, serverUrl, bodyCssPixels) {
  const response = await page.goto(`${serverUrl}/public/index.html`, {
    waitUntil: 'networkidle',
  });
  assert.equal(response.status(), 200);
  await page.locator('[data-action="begin-battle"]').first().click();
  await page.waitForFunction(() => document.querySelector('.battle-frame') !== null);
  const frame = page.frames().find((candidate) => candidate.url().includes('ui-arena-shell.html'));
  assert.ok(frame, 'the actual app mounted its arena iframe');
  await frame.waitForFunction((expectedBodyCssPixels) =>
    Number(document.documentElement.dataset.combatBodyCssPixels) === expectedBodyCssPixels &&
    Number(document.documentElement.dataset.combatFrameScale) > 0,
  bodyCssPixels);
  return frame;
}

async function mountActualGame(frame, {
  sessionBytes,
  terminalProfile,
  expectedTargetAxis = null,
  expectedDirections = null,
}) {
  return frame.evaluate(async ({
    sessionBytes,
    terminalProfile,
    expectedTargetAxis,
    expectedDirections,
    origin,
  }) => {
    const [{ arenaHudController }, { GameSession },
      { mountShippedGameBrowser, createShippedGameSessionSetup }] =
      await Promise.all([
        import(`${origin}/src/ui/arena-shell-entry.js`),
        import(`${origin}/src/sim/game-session.js`),
        import(`${origin}/src/ui/game-browser-entry.js`),
      ]);
    if (!arenaHudController) throw new Error('actual arena controller is unavailable');
    const session = terminalProfile === null
      ? GameSession.restore(sessionBytes)
      : new GameSession(createShippedGameSessionSetup(2, terminalProfile));
    const sourceSessionBytes = session.serialize();
    const sessionSummary = (candidate) => {
      const units = candidate.state.battle.units.map((unit) => ({
        alive: unit.alive,
        cardId: unit.cardId ?? null,
        hitpoints: unit.hitpoints,
        id: unit.id,
        kind: unit.archetypeId ?? null,
        position: unit.position,
        side: unit.side,
        targetId: unit.targetId ?? null,
      }));
      const unitsById = new Map(units.map((unit) => [unit.id, unit]));
      const targetVectors = units
        .filter((unit) => unit.alive && unit.cardId === 'copperskiff')
        .map((unit) => {
          const target = unitsById.get(unit.targetId);
          if (target === undefined) {
            return {
              from: unit.position,
              id: unit.id,
              side: unit.side,
              targetId: unit.targetId,
              targetPosition: null,
              targetSide: null,
              dx: null,
              dy: null,
              dominantAxis: null,
            };
          }
          const dx = target.position.x - unit.position.x;
          const dy = target.position.y - unit.position.y;
          return {
            from: unit.position,
            id: unit.id,
            side: unit.side,
            targetId: unit.targetId,
            targetPosition: target.position,
            targetSide: target.side,
            dx,
            dy,
            dominantAxis: Math.abs(dx) > Math.abs(dy) ? 'x'
              : Math.abs(dy) > Math.abs(dx) ? 'y' : 'tie',
          };
        });
      return {
        deploymentReceipts: candidate.replay
          .filter((event) => event.type === 'session-deployed')
          .map(({ deployment, side, tick }) => ({
            cardId: deployment.cardId,
            entityIds: deployment.entityIds,
            point: deployment.point,
            side,
            tick,
          })),
        pendingPlayerCommands: candidate.state.pendingPlayerCommands,
        tick: candidate.state.tick,
        targetVectors,
        units,
      };
    };
    const sourceSummary = sessionSummary(session);
    const sourceSides = sourceSummary.units
      .filter((unit) => unit.alive && unit.cardId === 'copperskiff')
      .map((unit) => unit.side)
      .sort();
    const deploymentSides = sourceSummary.deploymentReceipts
      .filter((receipt) => receipt.cardId === 'copperskiff')
      .map((receipt) => receipt.side)
      .sort();
    if (terminalProfile === null &&
        (JSON.stringify(sourceSides) !== JSON.stringify(['north', 'south']) ||
         JSON.stringify(deploymentSides) !== JSON.stringify(['north', 'south']))) {
      throw new Error('source GameSession lacks admitted live north and south Copperskiffs');
    }
    if (expectedTargetAxis !== null) {
      const north = sourceSummary.targetVectors.find(({ side }) => side === 'north');
      const south = sourceSummary.targetVectors.find(({ side }) => side === 'south');
      const mutualTargeting = north?.targetId === south?.id &&
        north?.targetSide === 'south' && south?.targetId === north?.id &&
        south?.targetSide === 'north';
      const dominantAxisMatches = north?.dominantAxis === expectedTargetAxis &&
        south?.dominantAxis === expectedTargetAxis;
      const directionFromVector = (vector) => {
        if (Math.abs(vector.dx) > Math.abs(vector.dy)) {
          return vector.dx > 0 ? 'east' : 'west';
        }
        return vector.dy > 0 ? 'north' : 'south';
      };
      const headingsMatch = expectedDirections !== null &&
        north !== undefined && south !== undefined &&
        directionFromVector(north) === expectedDirections.north &&
        directionFromVector(south) === expectedDirections.south;
      if (!mutualTargeting || !dominantAxisMatches || !headingsMatch) {
        throw new Error(`source Copperskiff target precondition failed before browser restore: ${JSON.stringify({
          expectedDirections,
          expectedTargetAxis,
          headings: north && south ? {
            north: directionFromVector(north),
            south: directionFromVector(south),
          } : null,
          targetVectors: sourceSummary.targetVectors,
        })}`);
      }
    }
    if (sessionBytes !== null && sourceSessionBytes !== sessionBytes) {
      throw new Error('browser GameSession restore changed the serialized witness bytes');
    }
    const stagingRoot = document.createElement('div');
    const stagedController = mountShippedGameBrowser(stagingRoot, window, session, () => null);
    let browserSnapshot;
    let stagedControllerState;
    try {
      if (!stagedController.state.running) throw new Error('staged game session is not running');
      stagedControllerState = { ...stagedController.state };
      browserSnapshot = stagedController.serialize();
    } finally {
      stagedController.dispose();
    }
    const stagedSnapshotSession = JSON.parse(browserSnapshot).session;
    arenaHudController.restore(browserSnapshot);
    const restoredSessionBytes = arenaHudController.session.serialize();
    if (!arenaHudController.enterManualStepMode()) {
      throw new Error('restored actual arena did not enter manual step mode');
    }
    const controller = arenaHudController;
    const restoredSummary = sessionSummary(controller.session);
    globalThis.__copperskiffGameController = controller;
    const units = controller.session.state.battle.units.map((unit) => ({
      alive: unit.alive,
      archetypeId: unit.archetypeId ?? null,
      cardId: unit.cardId ?? null,
      hitpoints: unit.hitpoints,
      id: unit.id,
      position: unit.position,
      side: unit.side,
    }));
    const markerSelector = '.combat-marker[data-kind="copperskiff"]';
    const markerSummary = Array.from(document.querySelectorAll(markerSelector), (marker) => {
      const bounds = marker.getBoundingClientRect();
      const style = getComputedStyle(marker);
      const art = marker.querySelector('.combat-art--copperskiff');
      const artStyle = art ? getComputedStyle(art) : null;
      return {
        artFound: art !== null,
        artVisibility: artStyle?.visibility ?? null,
        display: style.display,
        height: bounds.height,
        kind: marker.dataset.kind ?? null,
        left: bounds.left,
        opacity: style.opacity,
        side: marker.dataset.side ?? null,
        top: bounds.top,
        visibility: style.visibility,
        width: bounds.width,
      };
    });
    return {
      browserSnapshotSessionMatchesSource: stagedSnapshotSession === sourceSessionBytes,
      controllerState: { ...controller.state },
      markerSelector,
      markerSummary,
      rootSelectorFound: document.querySelector('[data-arena-shell-root]') !== null,
      restoredSummary,
      sourceSummary,
      restoredSessionMatchesSource: restoredSessionBytes === sourceSessionBytes,
      sourceSessionBytes: sourceSessionBytes.length,
      stagedControllerState,
      units,
    };
  }, {
    origin: new URL('.', frame.url()).origin,
    sessionBytes,
    expectedTargetAxis,
    expectedDirections,
    terminalProfile: terminalProfile ?? null,
  });
}

async function observeBattle(page, expected, expectedTargetAxis, maxTicks = 3_600) {
  return page.evaluate(async ({ expected, expectedTargetAxis, maxTicks }) => {
    const controller = globalThis.__copperskiffGameController;
    const { createCombatMotionView } = await import('/src/ui/combat-motion.js');
    const frames = new Map();
    const canonicalContactSides = new Set();
    const canonicalDamageBySide = new Map();
    const spriteContactSides = new Set();
    let contactCheckpoint = null;
    let latestTargetVectors = [];
    let visibleUnits = 0;
    const bodyCssPixels = Number(document.documentElement.dataset.combatBodyCssPixels);
    const frameScale = Number(document.documentElement.dataset.combatFrameScale);
    const atlasImage = new Image();
    atlasImage.src = '/public/assets/copperskiff-battle-sprite.png';
    await atlasImage.decode();
    if (atlasImage.naturalWidth !== 256 || atlasImage.naturalHeight !== 256) {
      throw new Error('live Copperskiff atlas must decode at 256 by 256 pixels');
    }
    const canvas = document.createElement('canvas');
    canvas.width = atlasImage.naturalWidth;
    canvas.height = atlasImage.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(atlasImage, 0, 0);
    const atlasPixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const describeLiveState = () => ({
      controllerState: controller.state,
      sessionTick: controller.session.state.tick,
      units: controller.session.state.battle.units.map((unit) => ({
        alive: unit.alive,
        archetypeId: unit.archetypeId ?? null,
        cardId: unit.cardId ?? null,
        hitpoints: unit.hitpoints,
        id: unit.id,
        position: unit.position,
        side: unit.side,
        targetId: unit.targetId ?? null,
      })),
      markers: Array.from(document.querySelectorAll('.combat-marker[data-kind="copperskiff"]'),
        (marker) => {
          const bounds = marker.getBoundingClientRect();
          const style = getComputedStyle(marker);
          const art = marker.querySelector('.combat-art--copperskiff');
          const artStyle = art ? getComputedStyle(art) : null;
          return {
            artDirection: art?.dataset.spriteDirection ?? null,
            artFrame: art?.dataset.spriteFrame ?? null,
            artVisibility: artStyle?.visibility ?? null,
            display: style.display,
            height: bounds.height,
            kind: marker.dataset.kind,
            opacity: style.opacity,
            side: marker.dataset.side,
            top: bounds.top,
            visibility: style.visibility,
            width: bounds.width,
            left: bounds.left,
          };
        }),
    });
    const initialState = describeLiveState();
    const initialHitpointsById = new Map(controller.session.state.battle.units
      .filter((unit) => unit.archetypeId === 'copperskiff')
      .map((unit) => [String(unit.id), unit.hitpoints]));
    for (let tick = 0; tick < maxTicks; tick += 1) {
      controller.stepMany(1);
      const projection = controller.session.projectionSnapshot();
      const motionView = createCombatMotionView(projection);
      const unitsById = new Map(projection.state.battle.units
        .map((unit) => [String(unit.id), unit]));
      latestTargetVectors = projection.state.battle.units
        .filter((unit) => unit.alive && unit.archetypeId === 'copperskiff')
        .map((unit) => {
          const target = unitsById.get(String(unit.targetId));
          if (target === undefined) {
            return {
              from: unit.position,
              id: unit.id,
              side: unit.side,
              targetId: unit.targetId ?? null,
              targetPosition: null,
              targetSide: null,
              dx: null,
              dy: null,
              dominantAxis: null,
            };
          }
          const dx = target.position.x - unit.position.x;
          const dy = target.position.y - unit.position.y;
          return {
            from: unit.position,
            id: unit.id,
            side: unit.side,
            targetId: unit.targetId,
            targetPosition: target.position,
            targetSide: target.side,
            dx,
            dy,
            dominantAxis: Math.abs(dx) > Math.abs(dy) ? 'x'
              : Math.abs(dy) > Math.abs(dx) ? 'y' : 'tie',
          };
        });
      for (const unit of projection.state.battle.units) {
        const initialHitpoints = initialHitpointsById.get(String(unit.id));
        if (unit.archetypeId === 'copperskiff' && initialHitpoints !== undefined &&
            unit.hitpoints < initialHitpoints) {
          canonicalDamageBySide.set(unit.side, {
            id: unit.id,
            hitpoints: unit.hitpoints,
            initialHitpoints,
            tick: controller.session.state.tick,
          });
        }
      }
      const northTarget = latestTargetVectors.find(({ side }) => side === 'north');
      const southTarget = latestTargetVectors.find(({ side }) => side === 'south');
      const targetVectorsReady = latestTargetVectors.length === 2 &&
        northTarget?.targetId === southTarget?.id && northTarget?.targetSide === 'south' &&
        southTarget?.targetId === northTarget?.id && southTarget?.targetSide === 'north' &&
        northTarget?.dominantAxis === expectedTargetAxis &&
        southTarget?.dominantAxis === expectedTargetAxis;
      const posesById = new Map(motionView.poses
        .map((pose) => [String(pose.id), pose]));
      const currentCanonicalContactSides = new Set();
      for (const pose of motionView.poses) {
        const unit = unitsById.get(String(pose.id));
        if (unit?.archetypeId !== 'copperskiff' ||
            !['attack', 'recoil'].includes(pose.pose)) continue;
        canonicalContactSides.add(unit.side);
        currentCanonicalContactSides.add(unit.side);
      }
      const markers = Array.from(document.querySelectorAll(
        '.combat-marker[data-kind="copperskiff"]',
      ));
      visibleUnits = Math.max(visibleUnits, markers.length);
      for (const marker of markers) {
        const art = marker.querySelector('.combat-art--copperskiff');
        if (!art) continue;
        const [sourceX, sourceY, sourceWidth, sourceHeight] =
          art.getAttribute('viewBox').trim().split(/[ ,]+/u).map(Number);
        let alphaLeft = sourceWidth;
        let alphaTop = sourceHeight;
        let alphaRight = -1;
        let alphaBottom = -1;
        for (let y = sourceY; y < sourceY + sourceHeight; y += 1) {
          for (let x = sourceX; x < sourceX + sourceWidth; x += 1) {
            if (atlasPixels[(y * canvas.width + x) * 4 + 3] <= 16) continue;
            alphaLeft = Math.min(alphaLeft, x - sourceX);
            alphaTop = Math.min(alphaTop, y - sourceY);
            alphaRight = Math.max(alphaRight, x - sourceX);
            alphaBottom = Math.max(alphaBottom, y - sourceY);
          }
        }
        if (alphaRight < alphaLeft || alphaBottom < alphaTop) {
          throw new Error(`empty Copperskiff atlas body in ${art.dataset.spriteFrame}`);
        }
        const alphaWidth = alphaRight - alphaLeft + 1;
        const alphaHeight = alphaBottom - alphaTop + 1;
        const sample = {
          alphaBounds: { bottom: alphaBottom, left: alphaLeft, right: alphaRight, top: alphaTop },
          action: art.dataset.spriteAction,
          canonicalPose: posesById.get(marker.dataset.combatId)?.pose ?? null,
          canonicalTargetId: unitsById.get(marker.dataset.combatId)?.targetId ?? null,
          direction: art.dataset.spriteDirection,
          frame: art.dataset.spriteFrame,
          height: art.getBoundingClientRect().height,
          pivotErrorX: art.getBoundingClientRect().left + art.getBoundingClientRect().width / 2 -
            (marker.getBoundingClientRect().left + marker.getBoundingClientRect().width / 2),
          pivotErrorY: art.getBoundingClientRect().top + art.getBoundingClientRect().height * 0.84375 -
            (marker.getBoundingClientRect().top + marker.getBoundingClientRect().height / 2),
          reducedMotion: art.dataset.reducedMotion,
          renderedBodyHeightPixels: alphaHeight *
            art.getBoundingClientRect().height / sourceHeight * frameScale,
          renderedBodyWidthPixels: alphaWidth *
            art.getBoundingClientRect().width / sourceWidth * frameScale,
          renderedFrameHeightPixels: art.getBoundingClientRect().height * frameScale,
          renderedFrameWidthPixels: art.getBoundingClientRect().width * frameScale,
          side: art.dataset.spriteSide,
          tick: controller.session.state.tick,
          width: art.getBoundingClientRect().width,
        };
        frames.set(`${sample.side}:${sample.direction}:${sample.canonicalPose}`, sample);
        if (sample.action === 'contact') {
          spriteContactSides.add(sample.side);
        }
      }
      const directionsReady = Object.entries(expected).every(([side, direction]) =>
        [...frames.values()].some((sample) => sample.side === side &&
          sample.direction === direction));
      if (directionsReady && targetVectorsReady && canonicalContactSides.has('north') &&
          canonicalContactSides.has('south') && currentCanonicalContactSides.size > 0 &&
          canonicalDamageBySide.has('north') && canonicalDamageBySide.has('south')) {
        contactCheckpoint = controller.serialize();
        break;
      }
      if (tick % 60 === 59) {
        await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
      }
    }
    return {
      contactCheckpoint,
      canonicalContactSides: [...canonicalContactSides].sort(),
      canonicalDamageSides: [...canonicalDamageBySide.keys()].sort(),
      canonicalDamageEvidence: [...canonicalDamageBySide.entries()]
        .map(([side, evidence]) => ({ side, ...evidence }))
        .sort((left, right) => left.side.localeCompare(right.side)),
      spriteContactSides: [...spriteContactSides].sort(),
      bodyCssPixels,
      frameScale,
      frames: [...frames.values()].sort((left, right) =>
        left.side.localeCompare(right.side) || left.direction.localeCompare(right.direction) ||
        left.action.localeCompare(right.action)),
      sessionTick: controller.session.state.tick,
      targetVectors: latestTargetVectors,
      visibleUnits,
      initialState,
      finalState: describeLiveState(),
    };
  }, { expected, expectedTargetAxis, maxTicks });
}

async function captureContinuation(frame) {
  return frame.evaluate(() => {
    const controller = globalThis.__copperskiffGameController;
    const browserBytes = controller.serialize();
    const browserSnapshot = JSON.parse(browserBytes);
    const sessionBytes = controller.session.serialize();
    const sessionSnapshot = JSON.parse(sessionBytes);
    const audioContinuationBytes = controller.audioContinuationBytes;
    const audioDiagnostics = controller.audioDiagnostics;
    return {
      audioContinuationBytes,
      audioContinuation: JSON.parse(audioContinuationBytes),
      audioEvidence: {
        actualScheduledPcmCount: controller.audioScheduledPcm.length,
        cursor: audioDiagnostics.cursor,
        eventCount: audioDiagnostics.eventCount,
        sessionTick: audioDiagnostics.sessionTick,
        uiSequence: audioDiagnostics.uiSequence,
      },
      bridgeBytes: browserSnapshot.bridge,
      bridgeDeliveries: JSON.parse(browserSnapshot.bridge).deliveries,
      browserBytes,
      controllerState: { ...controller.state },
      sessionAdmissions: sessionSnapshot.transcript
        .filter(({ type }) => type === 'submit')
        .map(({ command }) => command),
      sessionBytes,
      sessionTick: controller.session.state.tick,
      hand: [...controller.session.state.decks.south.hand],
      elixirAmount: controller.session.state.elixir.sides.south.amount,
      pendingPlayerCommands: controller.session.state.pendingPlayerCommands,
      units: controller.session.state.battle.units
        .filter((unit) => unit.cardId === 'copperskiff')
        .map(({ alive, hitpoints, id, position, side, targetId }) => ({
          alive, hitpoints, id, position, side, targetId,
        }))
        .sort((left, right) => left.side.localeCompare(right.side)),
    };
  });
}

function continuationReceipt(snapshot) {
  return {
    audioContinuationBytes: snapshot.audioContinuationBytes,
    bridgeBytes: snapshot.bridgeBytes,
    browserBytes: snapshot.browserBytes,
    sessionBytes: snapshot.sessionBytes,
  };
}

function cheapestAffordableTroop(snapshot) {
  const choices = snapshot.hand.map((cardId, slot) => ({
    card: CARDS_BY_ID.get(cardId),
    cardId,
    slot,
  })).filter(({ card, cardId }) => card !== undefined && card.kind === 'unit' &&
    cardId !== 'copperskiff' && Number.isSafeInteger(card.cost) &&
    card.cost <= snapshot.elixirAmount)
    .sort((left, right) => left.card.cost - right.card.cost || left.slot - right.slot);
  assert.ok(choices.length > 0,
    'the current hand has an affordable non-Copperskiff troop for a native placement');
  const { card, cardId, slot } = choices[0];
  return {
    cardId,
    cost: card.cost,
    point: { x: 1_500, y: 1_000 },
    slot,
    tick: snapshot.sessionTick,
    type: 'deploy',
  };
}

async function deliverNativePlacement(frame, plan) {
  const before = await captureContinuation(frame);
  const card = frame.locator(`[data-ui="card-slot"][data-card-id="${plan.cardId}"]`).first();
  await card.click();
  const afterCardClick = await captureContinuation(frame);
  const arena = frame.locator('[data-ui="arena"]');
  const geometry = await arena.evaluate((element, point) => {
    const bounds = element.getBoundingClientRect();
    const offset = {
      x: element.clientLeft + point.x * element.clientWidth / 18_000,
      y: element.clientTop + element.clientHeight - point.y * element.clientHeight / 32_000,
    };
    return {
      bounds: { height: bounds.height, left: bounds.left, top: bounds.top, width: bounds.width },
      client: { height: element.clientHeight, left: element.clientLeft,
        top: element.clientTop, width: element.clientWidth },
      expectedClientPoint: { x: bounds.left + offset.x, y: bounds.top + offset.y },
      locatorOffset: offset,
      innerViewport: { height: innerHeight, width: innerWidth },
    };
  }, plan.point);
  await frame.evaluate((expectedClientPoint) => {
    const observations = [];
    const describe = (node) => {
      if (!(node instanceof Element)) return { nodeName: node?.nodeName ?? null };
      const bounds = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        ariaHidden: node.getAttribute('aria-hidden'),
        className: node.getAttribute('class'),
        dataUi: node.getAttribute('data-ui'),
        height: bounds.height,
        hidden: node.hidden,
        id: node.id || null,
        inert: node.inert,
        pointerEvents: style.pointerEvents,
        tagName: node.tagName,
        top: bounds.top,
        visibility: style.visibility,
        width: bounds.width,
        left: bounds.left,
      };
    };
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) {
      document.addEventListener(type, (event) => {
        observations.push({
          clientX: event.clientX,
          clientY: event.clientY,
          composedPath: event.composedPath().slice(0, 8).map(describe),
          isTrusted: event.isTrusted,
          pointerType: event.pointerType ?? null,
          target: describe(event.target),
          type,
        });
      }, true);
    }
    globalThis.__copperskiffInputPointerEvents = observations;
    const arena = document.querySelector('[data-ui="arena"]');
    const style = arena === null ? null : getComputedStyle(arena);
    const hitStack = document.elementsFromPoint(expectedClientPoint.x, expectedClientPoint.y)
      .slice(0, 8).map(describe);
    globalThis.__copperskiffInputPointerDom = {
      activeElement: describe(document.activeElement),
      arena: arena === null ? null : {
        ...describe(arena),
        ariaModal: arena.getAttribute('aria-modal'),
        connected: arena.isConnected,
        outerHtml: arena.outerHTML.slice(0, 500),
      },
      documentVisibility: document.visibilityState,
      expectedClientPoint,
      hitStack,
      overlays: [...document.querySelectorAll('[inert], [aria-modal], [role="dialog"], [data-overlay], [data-ui*="overlay"]')]
        .map(describe),
    };
  }, geometry.expectedClientPoint);
  const page = frame.page();
  await page.evaluate((framePath) => {
    const observations = [];
    const describe = (node) => {
      if (!(node instanceof Element)) return { nodeName: node?.nodeName ?? null };
      const bounds = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        className: node.getAttribute('class'),
        height: bounds.height,
        left: bounds.left,
        pointerEvents: style.pointerEvents,
        src: node instanceof HTMLIFrameElement ? node.src : null,
        tagName: node.tagName,
        top: bounds.top,
        width: bounds.width,
      };
    };
    for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click']) {
      document.addEventListener(type, (event) => observations.push({
        clientX: event.clientX,
        clientY: event.clientY,
        composedPath: event.composedPath().slice(0, 8).map(describe),
        isTrusted: event.isTrusted,
        pointerType: event.pointerType ?? null,
        target: describe(event.target),
        type,
      }), true);
    }
    globalThis.__copperskiffOuterPointerEvents = observations;
    const iframe = [...document.querySelectorAll('iframe')].find((candidate) => {
      try { return new URL(candidate.src, location.href).pathname.endsWith(framePath); }
      catch { return false; }
    });
    const chain = [];
    for (let node = iframe; node instanceof Element; node = node.parentElement) {
      const style = getComputedStyle(node);
      const bounds = node.getBoundingClientRect();
      chain.push({
        className: node.getAttribute('class'),
        height: bounds.height,
        left: bounds.left,
        offsetHeight: node.offsetHeight,
        offsetWidth: node.offsetWidth,
        tagName: node.tagName,
        top: bounds.top,
        transform: style.transform,
        width: bounds.width,
        zoom: style.zoom,
      });
    }
    globalThis.__copperskiffOuterFrameDom = {
      activeElement: describe(document.activeElement),
      frame: iframe === undefined ? null : {
        ...describe(iframe),
        clientHeight: iframe.clientHeight,
        clientLeft: iframe.clientLeft,
        clientTop: iframe.clientTop,
        clientWidth: iframe.clientWidth,
        contentDocumentReady: iframe.contentDocument?.readyState ?? null,
        heightAttribute: iframe.getAttribute('height'),
        isConnected: iframe.isConnected,
        offsetHeight: iframe.offsetHeight,
        offsetWidth: iframe.offsetWidth,
        widthAttribute: iframe.getAttribute('width'),
      },
      innerViewport: { height: innerHeight, width: innerWidth },
      scroll: { x: scrollX, y: scrollY },
      visibility: document.visibilityState,
      transformChain: chain,
    };
  }, '/ui-arena-shell.html');
  const [frameDomBefore, outerDomBefore] = await Promise.all([
    frame.evaluate(() => globalThis.__copperskiffInputPointerDom ?? null),
    page.evaluate(() => globalThis.__copperskiffOuterFrameDom ?? null),
  ]);
  assert.ok(outerDomBefore?.frame, 'the shipped battle iframe is measurable in the outer page');
  const iframeScaleX = outerDomBefore.frame.width / outerDomBefore.frame.offsetWidth;
  const iframeScaleY = outerDomBefore.frame.height / outerDomBefore.frame.offsetHeight;
  const outerMousePoint = {
    x: outerDomBefore.frame.left +
      (outerDomBefore.frame.clientLeft + geometry.expectedClientPoint.x *
        outerDomBefore.frame.clientWidth / geometry.innerViewport.width) * iframeScaleX,
    y: outerDomBefore.frame.top +
      (outerDomBefore.frame.clientTop + geometry.expectedClientPoint.y *
        outerDomBefore.frame.clientHeight / geometry.innerViewport.height) * iframeScaleY,
  };
  await page.mouse.click(outerMousePoint.x, outerMousePoint.y);
  const after = await captureContinuation(frame);
  const [framePointerEvents, outerPointerEvents] = await Promise.all([
    frame.evaluate(() => globalThis.__copperskiffInputPointerEvents ?? []),
    page.evaluate(() => globalThis.__copperskiffOuterPointerEvents ?? []),
  ]);
  const diagnostic = {
    afterCardClickSelectedCardId: afterCardClick.controllerState.selectedCardId,
    afterPlacementSelectedCardId: after.controllerState.selectedCardId,
    arenaGeometry: geometry,
    bridgeDeliveriesAfter: after.bridgeDeliveries.length,
    bridgeDeliveriesBefore: before.bridgeDeliveries.length,
    frameDom: frameDomBefore,
    framePointerEvents,
    handAfterCardClick: afterCardClick.hand,
    outerDom: outerDomBefore,
    outerMousePoint,
    iframeScale: { x: iframeScaleX, y: iframeScaleY },
    outerPointerEvents,
    plan,
  };
  assert.equal(after.bridgeDeliveries.length, before.bridgeDeliveries.length + 1,
    `one card-slot and arena pointer gesture adds exactly one real GameInputBridge delivery: ${JSON.stringify(diagnostic)}`);
  const delivery = after.bridgeDeliveries.at(-1);
  const arenaPointerUp = framePointerEvents.find(({ type }) => type === 'pointerup');
  assert.ok(arenaPointerUp?.isTrusted === true,
    'the arena observes the actual trusted Playwright pointerup inside the iframe');
  assert.ok(arenaPointerUp.composedPath.some(({ dataUi }) => dataUi === 'arena'),
    'the actual pointer event path reaches the shipped arena input element');
  assert.deepEqual({
    x: Math.floor((arenaPointerUp.clientX - geometry.bounds.left - geometry.client.left) *
      18_000 / geometry.client.width),
    y: Math.floor((geometry.bounds.top + geometry.client.top + geometry.client.height -
      arenaPointerUp.clientY) * 32_000 / geometry.client.height),
  }, plan.point, 'the mapped trusted arena pointer reaches the intended legal deployment point');
  assert.deepEqual(delivery.command, {
    cardId: plan.cardId,
    commandId: before.bridgeDeliveries.length + 1,
    point: plan.point,
    slot: plan.slot,
    tick: before.sessionTick,
    type: 'deploy',
  }, 'the native pointer delivery retains its selected card, slot, point, and current tick');
  assert.deepEqual(delivery.admission, {
    accepted: true,
    commandId: delivery.command.commandId,
    tick: before.sessionTick,
    type: 'player-command-admitted',
  }, 'the live GameInputBridge records an accepted player command');
  return { after, before, delivery, diagnostic };
}

async function compareScreenshotPixels(page, before, after) {
  return page.evaluate(async ({ beforeBase64, afterBase64 }) => {
    const decode = async (encoded) => {
      const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (context === null) throw new Error('PNG pixel comparison canvas is unavailable');
      context.drawImage(bitmap, 0, 0);
      const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
      bitmap.close();
      return { height: canvas.height, pixels: image.data, width: canvas.width };
    };
    const left = await decode(beforeBase64);
    const right = await decode(afterBase64);
    if (left.width !== right.width || left.height !== right.height) {
      return {
        afterSize: { height: right.height, width: right.width },
        beforeSize: { height: left.height, width: left.width },
        changedPixels: null,
        equal: false,
        pixelChannelsDifferent: null,
      };
    }
    let changedPixels = 0;
    let pixelChannelsDifferent = 0;
    let leftBound = left.width;
    let topBound = left.height;
    let rightBound = -1;
    let bottomBound = -1;
    for (let offset = 0, pixel = 0; offset < left.pixels.length; offset += 4, pixel += 1) {
      let changed = false;
      for (let channel = 0; channel < 4; channel += 1) {
        if (left.pixels[offset + channel] === right.pixels[offset + channel]) continue;
        pixelChannelsDifferent += 1;
        changed = true;
      }
      if (!changed) continue;
      changedPixels += 1;
      const x = pixel % left.width;
      const y = Math.floor(pixel / left.width);
      leftBound = Math.min(leftBound, x);
      topBound = Math.min(topBound, y);
      rightBound = Math.max(rightBound, x);
      bottomBound = Math.max(bottomBound, y);
    }
    return {
      changedPixelBounds: changedPixels === 0 ? null : {
        bottom: bottomBound, left: leftBound, right: rightBound, top: topBound,
      },
      changedPixels,
      equal: changedPixels === 0,
      height: left.height,
      pixelChannelsDifferent,
      width: left.width,
    };
  }, {
    afterBase64: after.toString('base64'),
    beforeBase64: before.toString('base64'),
  });
}

async function captureRestoreVisualDom(page, frame) {
  const outer = await page.evaluate((pixelBounds) => {
    const iframe = document.querySelector('iframe.battle-frame');
    if (!(iframe instanceof HTMLIFrameElement)) {
      throw new Error('the live battle iframe is missing during restore visual capture');
    }
    const rect = iframe.getBoundingClientRect();
    const scaleX = rect.width / iframe.offsetWidth;
    const scaleY = rect.height / iframe.offsetHeight;
    const pixelToFrame = (point) => ({
      x: (point.x - rect.left) / scaleX - iframe.clientLeft,
      y: (point.y - rect.top) / scaleY - iframe.clientTop,
    });
    const topFrame = (node) => node === null ? null : {
      active: node === document.activeElement,
      ariaHidden: node.getAttribute('aria-hidden'),
      className: typeof node.className === 'string' ? node.className : null,
      dataUi: node.getAttribute('data-ui'),
      id: node.id || null,
      inert: node.inert === true,
      tagName: node.tagName,
      text: (node.textContent ?? '').trim().slice(0, 240),
    };
    const hover = [];
    for (let node = document.querySelector(':hover'); node !== null; node = node.parentElement) {
      hover.push(topFrame(node));
    }
    return {
      activeElement: topFrame(document.activeElement),
      documentFocused: document.hasFocus(),
      hover,
      iframe: {
        clientHeight: iframe.clientHeight,
        clientLeft: iframe.clientLeft,
        clientTop: iframe.clientTop,
        clientWidth: iframe.clientWidth,
        cssTransform: getComputedStyle(iframe).transform,
        height: rect.height,
        left: rect.left,
        offsetHeight: iframe.offsetHeight,
        offsetWidth: iframe.offsetWidth,
        pointerEvents: getComputedStyle(iframe).pointerEvents,
        scaleX,
        scaleY,
        top: rect.top,
        width: rect.width,
      },
      pixelBounds,
      pixelBoundsForCapture: pixelBounds,
      screenshotRegionInFrame: {
        bottom: pixelToFrame({ x: pixelBounds.left, y: pixelBounds.bottom + 1 }).y,
        left: pixelToFrame({ x: pixelBounds.left, y: pixelBounds.top }).x,
        right: pixelToFrame({ x: pixelBounds.right + 1, y: pixelBounds.top }).x,
        top: pixelToFrame({ x: pixelBounds.left, y: pixelBounds.top }).y,
      },
      scroll: { x: scrollX, y: scrollY },
      visibility: document.visibilityState,
    };
  }, PRIOR_DESKTOP_PIXEL_DIFF_BOUNDS);

  const inner = await frame.evaluate(({ iframe, pixelBounds, screenshotRegionInFrame }) => {
    const styleProperties = [
      'animation-delay', 'animation-duration', 'animation-iteration-count',
      'animation-name', 'animation-play-state', 'background-color', 'background-image',
      'border-color', 'border-radius', 'border-width', 'box-shadow', 'color', 'display',
      'filter', 'font-family', 'font-size', '-webkit-font-smoothing', 'font-weight', 'height',
      'left', 'line-height', 'opacity', 'overflow', 'pointer-events', 'position',
      'text-rendering', 'text-shadow', 'top', 'transform', 'transition-delay',
      'transition-duration', 'transition-property', 'translate', 'visibility', 'width',
      'will-change', 'z-index',
    ];
    const selectors = [
      'body', '.battle-shell', '[data-ui="arena"]', '.game-browser-layer',
      '.game-browser-layer--hud', '[data-ui="hud-projection"]', '[data-ui="hud-next"]',
      '[data-ui="hud-hand"]', '[data-ui="hud-elixir"]', '.hud-card', '.hud-card__name',
      '.hud-card__cost', '.combat-marker', '.combat-marker img', 'img[data-kind="cinderlings"]',
      'img[data-kind="copperskiff"]', 'canvas',
    ];
    const rectFor = (element) => {
      const rect = element.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        height: rect.height,
        left: rect.left,
        right: rect.right,
        top: rect.top,
        width: rect.width,
      };
    };
    const mapsToScreenshot = (rect) => {
      const outerRect = {
        bottom: iframe.top + (iframe.clientTop + rect.bottom) * iframe.scaleY,
        left: iframe.left + (iframe.clientLeft + rect.left) * iframe.scaleX,
        right: iframe.left + (iframe.clientLeft + rect.right) * iframe.scaleX,
        top: iframe.top + (iframe.clientTop + rect.top) * iframe.scaleY,
      };
      return {
        intersectsPriorPixelDiff: outerRect.right > pixelBounds.left &&
          outerRect.left <= pixelBounds.right &&
          outerRect.bottom > pixelBounds.top &&
          outerRect.top <= pixelBounds.bottom,
        rect: outerRect,
      };
    };
    const nodeSummary = (element) => {
      const style = getComputedStyle(element);
      const computed = Object.fromEntries(styleProperties.map((property) =>
        [property, style.getPropertyValue(property)]));
      const pseudo = (selector) => {
        const value = getComputedStyle(element, selector);
        return Object.fromEntries([
          'content', 'display', 'opacity', 'color', 'background-color', 'background-image',
          'border-color', 'box-shadow', 'transform', 'font-size',
        ].map((property) => [property, value.getPropertyValue(property)]));
      };
      const rect = rectFor(element);
      const attributes = Object.fromEntries([...element.attributes]
        .map(({ name, value }) => [name, value]));
      return {
        active: element === document.activeElement,
        ariaHidden: element.getAttribute('aria-hidden'),
        attributes,
        computed,
        dataUi: element.getAttribute('data-ui'),
        focusVisible: element.matches(':focus-visible'),
        hovered: element.matches(':hover'),
        inert: element.inert === true,
        outerHtml: ['[data-ui="hud-next"]', '[data-ui="hud-hand"]', '.hud-card']
          .some((selector) => element.matches(selector))
          ? element.outerHTML.slice(0, 1800) : null,
        outerScreenshot: mapsToScreenshot(rect),
        pseudo: { after: pseudo('::after'), before: pseudo('::before') },
        rect,
        tagName: element.tagName,
        text: (element.textContent ?? '').trim().slice(0, 240),
      };
    };
    const elements = [...new Set(selectors.flatMap((selector) =>
      [...document.querySelectorAll(selector)]))].map(nodeSummary);
    const hovered = [...document.querySelectorAll(':hover')].map((element) => ({
      className: typeof element.className === 'string' ? element.className : null,
      dataUi: element.getAttribute('data-ui'),
      id: element.id || null,
      tagName: element.tagName,
      text: (element.textContent ?? '').trim().slice(0, 120),
    }));
    return {
      activeElement: nodeSummary(document.activeElement),
      documentFocused: document.hasFocus(),
      elements,
      hovered,
      innerViewport: { height: innerHeight, width: innerWidth },
      screenshotRegionInFrame,
      scroll: { x: scrollX, y: scrollY },
      visibility: document.visibilityState,
    };
  }, {
    iframe: outer.iframe,
    pixelBounds: outer.pixelBoundsForCapture,
    screenshotRegionInFrame: outer.screenshotRegionInFrame,
  });
  return { inner, outer };
}


test(ONE_CASE_PROBE
  ? 'Copperskiff one-case live-game diagnostic captures state before assertions'
  : 'Copperskiff renders through the shipped GameSession browser at phone and desktop size', {
  timeout: 120_000,
}, async (t) => {
  const server = await startStaticServer();
  t.after(() => server.close());
  const browser = await chromium.launch({
    executablePath: CHROME !== '' && existsSync(CHROME) ? CHROME : undefined,
    headless: true,
  });
  t.after(() => browser.close());

  const report = [];
  const references = new Map();
  let checkpointPng = null;
  const runner = {
    argv: process.argv,
    browser: {
      chromeExecutable: CHROME || null,
      playwrightModule: process.env.GAME_BROWSER_PLAYWRIGHT ?? 'playwright',
    },
    environment: {
      allowlist: ENVIRONMENT_ALLOWLIST,
      values: Object.fromEntries(ENVIRONMENT_ALLOWLIST
        .filter((key) => process.env[key] !== undefined)
        .map((key) => [key, process.env[key]])),
    },
    node: process.version,
    oneCaseProbe: ONE_CASE_PROBE,
    singleCaseFullAssertions: SINGLE_CASE_FULL_ASSERTIONS,
    artifactAttemptId: ARTIFACT_ATTEMPT_ID,
    artifactDirectory: ARTIFACTS,
    testProcessPid: process.pid,
  };
  const reportPath = resolve(ARTIFACTS,
    ONE_CASE_PROBE ? 'actual-game-one-case-probe.json'
      : SINGLE_CASE_FULL_ASSERTIONS ? 'actual-game-first-case-full-assertions.json'
        : 'actual-game-report.json');
  const viewports = SINGLE_CASE ? [VIEWPORTS[0]] : VIEWPORTS;
  const motions = SINGLE_CASE ? [MOTIONS[0]] : MOTIONS;
  const scenarios = SINGLE_CASE ? [CASES[0]] : CASES;
  let restarted = null;
  const writeReport = () => writeFileSync(reportPath,
    `${JSON.stringify({ report, restarted, runner }, null, 2)}\n`);

  for (const viewport of viewports) {
    for (const motion of motions) {
      for (const scenario of scenarios) {
        const context = await browser.newContext({
          colorScheme: 'dark',
          deviceScaleFactor: 1,
          reducedMotion: motion.value,
          viewport: { width: viewport.width, height: viewport.height },
        });
        const page = await context.newPage();
        const pageErrors = [];
        const consoleMessages = [];
        const failedRequests = [];
        page.on('pageerror', (error) => pageErrors.push(String(error)));
        page.on('console', (message) => {
          if (consoleMessages.length < 200) {
            consoleMessages.push({ text: message.text(), type: message.type() });
          }
        });
        page.on('requestfailed', (request) => failedRequests.push({
          errorText: request.failure()?.errorText ?? 'failed',
          url: request.url(),
        }));

        const witness = sessionForCase(scenario);
        let frame = null;
        let openError = null;
        let mountAudit = null;
        let mountError = null;
        let observed = null;
        let observationError = null;
        try {
          frame = await openActualBattle(page, server.url, viewport.bodyCssPixels);
        } catch (error) {
          openError = { message: String(error), stack: error?.stack ?? null };
        }
        if (frame !== null) {
          try {
            mountAudit = await mountActualGame(frame, {
              sessionBytes: witness.sessionBytes,
              terminalProfile: null,
              expectedTargetAxis: scenario.expectedTargetAxis,
              expectedDirections: scenario.expected,
            });
          } catch (error) {
            mountError = { message: String(error), stack: error?.stack ?? null };
          }
          if (mountError === null) {
            try {
              observed = await observeBattle(frame, scenario.expected,
                scenario.expectedTargetAxis, ONE_CASE_PROBE ? 120 : 3_600);
            } catch (error) {
              observationError = { message: String(error), stack: error?.stack ?? null };
            }
          }
        }

        const screenshotPath = resolve(ARTIFACTS,
          `${viewport.width}x${viewport.height}-${motion.name}-${scenario.name}.png`);
        await page.screenshot({ path: screenshotPath, animations: 'disabled' });
        const screenshotBytes = await readFile(screenshotPath);
        const caseRecord = {
          admission: witness.admission,
          expected: scenario.expected,
          expectedTargetAxis: scenario.expectedTargetAxis,
          mountAudit,
          mountError,
          motion: motion.name,
          observationError,
          observed,
          openError,
          pageErrors,
          consoleMessages,
          failedRequests,
          screenshot: {
            byteLength: screenshotBytes.length,
            path: screenshotPath,
            sha256: createHash('sha256').update(screenshotBytes).digest('hex'),
          },
          scenario: scenario.name,
          setupWitness: witness.setupWitness,
          sessionSerialization: {
            controllerRestorePreservedExactBytes:
              mountAudit?.restoredSessionMatchesSource ?? null,
            sourceByteLength: Buffer.byteLength(witness.sessionBytes, 'utf8'),
            sourceSha256: witness.sourceSummary.sha256,
            stagedSnapshotPreservedExactBytes:
              mountAudit?.browserSnapshotSessionMatchesSource ?? null,
          },
          sourceSessionSummary: witness.sourceSummary,
          viewport: { ...viewport },
        };
        report.push(caseRecord);
        writeReport();

        assert.equal(openError, null, openError?.message ?? 'the shipped battle opened');
        assert.equal(mountError, null, mountError?.message ?? 'the witnessed session restored');
        assert.equal(observationError, null,
          observationError?.message ?? 'the live battle was observed');
        assert.deepEqual(pageErrors, []);
        assert.deepEqual(failedRequests, []);
        assert.deepEqual(server.missingPaths, []);
        assert.equal(mountAudit.rootSelectorFound, true,
          'the real arena controller is mounted at its shipped root selector');
        assert.equal(mountAudit.browserSnapshotSessionMatchesSource, true,
          'the staged browser snapshot preserves the exact source GameSession bytes');
        assert.equal(mountAudit.restoredSessionMatchesSource, true,
          'the real arena controller restore preserves the exact source GameSession bytes');
        const sourceSummaryWithoutHash = {
          deploymentReceipts: witness.sourceSummary.deploymentReceipts,
          pendingPlayerCommands: witness.sourceSummary.pendingPlayerCommands,
          tick: witness.sourceSummary.tick,
          targetVectors: witness.sourceSummary.targetVectors,
          units: witness.sourceSummary.units,
        };
        assert.deepEqual(mountAudit.sourceSummary, sourceSummaryWithoutHash,
          'the browser-restored source session has the exact witnessed team, kind, position and tick');
        assert.deepEqual(mountAudit.restoredSummary, sourceSummaryWithoutHash,
          'the real arena controller retains the exact witnessed session after restore');
        assert.ok(observed !== null);

        assert.ok(observed.visibleUnits >= 2,
          `${scenario.name} has live north and south Copperskiffs in the game renderer`);
        assert.deepEqual(observed.canonicalContactSides, ['north', 'south'],
          `${scenario.name} reaches canonical attack/recoil poses for both teams`);
        assert.deepEqual(observed.canonicalDamageSides, ['north', 'south'],
          `${scenario.name} records canonical HP damage separately from rendered sprite action`);
        const northTarget = observed.targetVectors.find(({ side }) => side === 'north');
        const southTarget = observed.targetVectors.find(({ side }) => side === 'south');
        assert.equal(northTarget?.targetId, southTarget?.id,
          `${scenario.name} North canonically targets the South Copperskiff`);
        assert.equal(southTarget?.targetId, northTarget?.id,
          `${scenario.name} South canonically targets the North Copperskiff`);
        assert.equal(northTarget?.dominantAxis, scenario.expectedTargetAxis);
        assert.equal(southTarget?.dominantAxis, scenario.expectedTargetAxis);
        if (motion.name === 'normal') {
          assert.deepEqual(observed.spriteContactSides, ['north', 'south'],
            `${scenario.name} renders contact atlas frames for both teams in normal motion`);
        }
        for (const [side, direction] of Object.entries(scenario.expected)) {
          assert.ok(observed.frames.some((frame) => frame.side === side &&
            frame.direction === direction),
          `${scenario.name}: live ${side} Copperskiff faces ${direction}`);
        }

        if (ONE_CASE_PROBE) {
          assert.equal(observed.bodyCssPixels, viewport.bodyCssPixels);
          await page.close();
          await context.close();
          assert.deepEqual(server.missingPaths, []);
          return;
        }

        assert.equal(observed.bodyCssPixels, viewport.bodyCssPixels);
        assert.ok(Number.isFinite(observed.frameScale) && observed.frameScale > 0);
        for (const frame of observed.frames) {
          assert.equal(frame.reducedMotion, String(motion.value === 'reduce'));
          const expectedCssSize = 64 * viewport.bodyCssPixels / 13 / observed.frameScale;
          const expectedLayoutCssSize = Math.floor(expectedCssSize * 64) / 64;
          const expectedRenderedFrameSize = 64 * viewport.bodyCssPixels / 13;
          const expectedBodyWidth =
            (frame.alphaBounds.right - frame.alphaBounds.left + 1) * viewport.bodyCssPixels / 13;
          const expectedBodyHeight =
            (frame.alphaBounds.bottom - frame.alphaBounds.top + 1) * viewport.bodyCssPixels / 13;
          assert.equal(frame.width, expectedLayoutCssSize,
            `${frame.frame} uses Chromium's exact 1/64px iframe-local layout quantum`);
          assert.equal(frame.height, expectedLayoutCssSize,
            `${frame.frame} uses Chromium's exact 1/64px iframe-local layout quantum`);
          assert.ok(Math.abs(frame.renderedFrameWidthPixels - expectedRenderedFrameSize) < 0.01,
            `${frame.frame} keeps the full atlas cell width after the outer iframe scale`);
          assert.ok(Math.abs(frame.renderedFrameHeightPixels - expectedRenderedFrameSize) < 0.01,
            `${frame.frame} keeps the full atlas cell height after the outer iframe scale`);
          assert.ok(Math.abs(frame.renderedBodyWidthPixels - expectedBodyWidth) < 0.01,
            `${frame.frame} preserves the measured body width through iframe scaling`);
          assert.ok(Math.abs(frame.renderedBodyHeightPixels - expectedBodyHeight) < 0.01,
            `${frame.frame} preserves the measured body height through iframe scaling`);
          assert.ok(Math.abs(frame.pivotErrorX) < 0.01);
          assert.ok(Math.abs(frame.pivotErrorY) < 0.01);
          const comparisonKey = `${viewport.name}:${scenario.name}:${frame.side}:${frame.direction}:${frame.canonicalPose}`;
          const reference = references.get(comparisonKey);
          if (motion.name === 'normal') references.set(comparisonKey, frame.frame);
          else if (!['attack', 'recoil'].includes(frame.canonicalPose)) assert.equal(frame.frame, reference,
            `${comparisonKey} keeps the same static cell under reduced motion`);
        }

        {
          assert.ok(observed.contactCheckpoint,
            'every live matrix case has a full browser contact checkpoint');
          const caseStem = `${viewport.width}x${viewport.height}-${motion.name}-${scenario.name}`;
          const observedCheckpoint = await captureContinuation(frame);
          assert.equal(observedCheckpoint.browserBytes, observed.contactCheckpoint,
            'the observed contact checkpoint is the exact live browser snapshot');
          assert.equal(observedCheckpoint.audioContinuation.sessionBytes,
            observedCheckpoint.sessionBytes,
          'audio continuation bytes retain the exact witnessed GameSession bytes');
          assert.ok(observedCheckpoint.sessionAdmissions.some((command) =>
            command.cardId === 'copperskiff' && command.type === 'deploy' && command.tick === 0),
          'the restored session transcript retains the actually admitted source deployment');
          assert.deepEqual(observedCheckpoint.bridgeDeliveries, [],
            'the programmatic setup witness does not fabricate a browser bridge delivery');
          const nativePlan = cheapestAffordableTroop(observedCheckpoint);
          const nativePlacement = await deliverNativePlacement(frame, nativePlan);
          const checkpoint = nativePlacement.after;
          assert.equal(checkpoint.sessionTick, observedCheckpoint.sessionTick,
            'native command admission preserves the witnessed contact tick before stepping');
          assert.deepEqual(checkpoint.units, observedCheckpoint.units,
            'the far-side native deployment leaves both Copperskiffs at their witnessed contact');
          assert.equal(checkpoint.pendingPlayerCommands.length,
            observedCheckpoint.pendingPlayerCommands.length + 1,
          'the accepted native deployment remains pending at its admitted simulation tick');
          assert.equal(checkpoint.bridgeDeliveries.length, 1);
          assert.equal(checkpoint.bridgeDeliveries[0].admission.accepted, true);
          assert.ok(checkpoint.sessionAdmissions.some((command) =>
            command.commandId === nativePlacement.delivery.command.commandId &&
            command.cardId === nativePlan.cardId && command.tick === checkpoint.sessionTick),
          'the browser bridge admission is present in the canonical session transcript');
          assert.equal(checkpoint.audioContinuation.sessionBytes, checkpoint.sessionBytes,
            'native input checkpoint audio continuation retains exact session bytes');
          const checkpointReceiptPath = resolve(ARTIFACTS,
            `${caseStem}-checkpoint-continuation.json`);
          writeFileSync(checkpointReceiptPath,
            `${JSON.stringify(continuationReceipt(checkpoint), null, 2)}\n`);

          await page.mouse.move(0, 0);
          await page.evaluate(() => document.activeElement instanceof HTMLElement &&
            document.activeElement.blur());
          const beforeRestore = await page.screenshot({ animations: 'disabled' });
          const beforeRestorePath = resolve(ARTIFACTS,
            `${caseStem}-checkpoint-before-restore.png`);
          writeFileSync(beforeRestorePath, beforeRestore);
          const captureDesktopVisualDom = VISUAL_DOM_DIAGNOSTICS &&
            viewport.name === 'desktop' && motion.name === 'normal' &&
            scenario.name === 'horizontal';
          const beforeRestoreVisualDom = captureDesktopVisualDom
            ? await captureRestoreVisualDom(page, frame) : null;

          const futureTicks = 120;
          await frame.evaluate((count) => {
            globalThis.__copperskiffGameController.stepMany(count);
          }, futureTicks);
          const futureReference = await captureContinuation(frame);
          assert.equal(futureReference.sessionTick, checkpoint.sessionTick + futureTicks,
            'the future branch advances the exact requested number of deterministic ticks');
          assert.notEqual(futureReference.sessionBytes, checkpoint.sessionBytes,
            'the future branch advances canonical game-session state');
          assert.ok(futureReference.units.every((unit, index) =>
            unit.hitpoints < checkpoint.units[index].hitpoints),
          'both canonical Copperskiffs continue attacking after the checkpoint');

          await frame.evaluate((saved) => {
            globalThis.__copperskiffGameController.restore(saved);
          }, checkpoint.browserBytes);
          await frame.evaluate(() => new Promise((resolveFrame) =>
            requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
          const restoredCheckpoint = await captureContinuation(frame);
          const afterRestore = await page.screenshot({ animations: 'disabled' });
          const afterRestoreVisualDom = captureDesktopVisualDom
            ? await captureRestoreVisualDom(page, frame) : null;
          const pixelComparison = await compareScreenshotPixels(page, beforeRestore, afterRestore);
          const afterRestorePath = resolve(ARTIFACTS,
            `${caseStem}-checkpoint-after-restore.png`);
          writeFileSync(afterRestorePath, afterRestore);
          if (viewport.name === 'phone' && motion.name === 'normal' &&
              scenario.name === 'horizontal') checkpointPng = beforeRestore;

          const restoreMatches = {
            audioContinuationBytes: restoredCheckpoint.audioContinuationBytes ===
              checkpoint.audioContinuationBytes,
            bridgeBytes: restoredCheckpoint.bridgeBytes === checkpoint.bridgeBytes,
            browserBytes: restoredCheckpoint.browserBytes === checkpoint.browserBytes,
            sessionBytes: restoredCheckpoint.sessionBytes === checkpoint.sessionBytes,
          };
          await frame.evaluate((count) => {
            globalThis.__copperskiffGameController.stepMany(count);
          }, futureTicks);
          const futureReplay = await captureContinuation(frame);
          const futureMatches = {
            audioContinuationBytes: futureReplay.audioContinuationBytes ===
              futureReference.audioContinuationBytes,
            bridgeBytes: futureReplay.bridgeBytes === futureReference.bridgeBytes,
            browserBytes: futureReplay.browserBytes === futureReference.browserBytes,
            sessionBytes: futureReplay.sessionBytes === futureReference.sessionBytes,
          };
          const futureReceiptPath = resolve(ARTIFACTS,
            `${caseStem}-future-continuation.json`);
          writeFileSync(futureReceiptPath, `${JSON.stringify({
            futureReference: continuationReceipt(futureReference),
            futureReplay: continuationReceipt(futureReplay),
            matches: futureMatches,
          }, null, 2)}\n`);

          caseRecord.checkpointRestore = {
            afterRestore: afterRestorePath,
            afterRestoreSha256: createHash('sha256').update(afterRestore).digest('hex'),
            beforeRestore: beforeRestorePath,
            beforeRestoreSha256: createHash('sha256').update(beforeRestore).digest('hex'),
            checkpoint: {
              audioContinuationBytesSha256: createHash('sha256')
                .update(checkpoint.audioContinuationBytes).digest('hex'),
              audioEvidence: checkpoint.audioEvidence,
              bridgeBytesSha256: createHash('sha256').update(checkpoint.bridgeBytes).digest('hex'),
              bridgeDeliveryCount: checkpoint.bridgeDeliveries.length,
              browserBytesSha256: createHash('sha256').update(checkpoint.browserBytes).digest('hex'),
              sessionAdmissions: checkpoint.sessionAdmissions,
              sessionBytesSha256: createHash('sha256').update(checkpoint.sessionBytes).digest('hex'),
              sessionTick: checkpoint.sessionTick,
              nativeDelivery: nativePlacement.delivery,
              nativeInputObservation: nativePlacement.diagnostic,
              nativePlacement: {
                cardId: nativePlan.cardId,
                cost: nativePlan.cost,
                point: nativePlan.point,
                slot: nativePlan.slot,
                tick: nativePlan.tick,
                type: nativePlan.type,
              },
              pointerBridgeDeliveryCountBefore: nativePlacement.before.bridgeDeliveries.length,
              sourceAdmissionProvenance:
                'GameSession.submitPlayerCommand setup witness; no browser gesture is claimed',
              nativeDeliveryProvenance:
              'Playwright clicked the actual card slot and root-page mouse point mapped through the measured shipped iframe transform',
            },
            checkpointContinuationArtifact: checkpointReceiptPath,
            encodedPngBytesEqual: beforeRestore.equals(afterRestore),
            equal: pixelComparison.equal,
            pixelComparison,
            futureContinuation: {
              actualAudioEvidence: {
                reference: futureReference.audioEvidence,
                restoredReplay: futureReplay.audioEvidence,
              },
              copperskiffUnits: futureReference.units,
              futureReceipt: futureReceiptPath,
              matches: futureMatches,
              replayedCopperskiffUnits: futureReplay.units,
              replayedSessionTick: futureReplay.sessionTick,
              referenceSessionTick: futureReference.sessionTick,
              ticks: futureTicks,
            },
            restoreMatches,
            visualDomDiagnostics: captureDesktopVisualDom ? {
              afterRestore: afterRestoreVisualDom,
              beforeRestore: beforeRestoreVisualDom,
              captureTiming: 'each visual DOM/style snapshot follows its already-saved full-viewport PNG',
              purpose: 'diagnostic-only; DOM reads are excluded from the uninstrumented screenshot gate',
            } : null,
          };
          writeReport();

          assert.equal(pixelComparison.width, viewport.width);
          assert.equal(pixelComparison.height, viewport.height);
          assert.equal(pixelComparison.changedPixels, 0,
            'restored viewport PNG has exact pixel identity with zero tolerance');
          assert.equal(pixelComparison.pixelChannelsDifferent, 0);
          assert.deepEqual(restoreMatches, {
            audioContinuationBytes: true,
            bridgeBytes: true,
            browserBytes: true,
            sessionBytes: true,
          }, 'restore preserves exact browser, session, GameInputBridge and audio continuation bytes');
          assert.equal(futureReplay.sessionTick, futureReference.sessionTick);
          assert.deepEqual(futureReplay.units, futureReference.units,
            'restored future progression reproduces canonical Copperskiff HP and positions');
          assert.deepEqual(futureMatches, {
            audioContinuationBytes: true,
            bridgeBytes: true,
            browserBytes: true,
            sessionBytes: true,
          }, 'restored future progression reproduces exact browser, session, bridge and audio bytes');
        }

        await page.close();
        await context.close();
        if (SINGLE_CASE_FULL_ASSERTIONS) return;
      }
    }
  }
  assert.deepEqual(server.missingPaths, []);
  if (checkpointPng !== null) {
    writeFileSync(resolve(ARTIFACTS, 'phone-horizontal-contact-checkpoint.png'), checkpointPng);
  }

  const restartContext = await browser.newContext({
    colorScheme: 'dark', deviceScaleFactor: 1,
    reducedMotion: 'no-preference', viewport: { width: 390, height: 844 },
  });
  const restartPage = await restartContext.newPage();
  const restartErrors = [];
  const restartConsoleMessages = [];
  restartPage.on('pageerror', (error) => restartErrors.push(String(error)));
  restartPage.on('console', (message) => {
    if (restartConsoleMessages.length < 200) {
      restartConsoleMessages.push({ text: message.text(), type: message.type() });
    }
  });
  restartPage.on('requestfailed', (request) => restartErrors.push({
    errorText: request.failure()?.errorText ?? 'failed',
    url: request.url(),
  }));
  const restartFrame = await openActualBattle(restartPage, server.url, 13);
  await mountActualGame(restartFrame, {
    sessionBytes: null,
    terminalProfile: 'live-seed-2-terminal',
  });
  const terminal = await restartFrame.evaluate(() => {
    const controller = globalThis.__copperskiffGameController;
    for (let segment = 0; segment < 15 && !controller.state.terminal; segment += 1) {
      controller.fastForwardSegment(1_200);
    }
    return {
      deck: JSON.parse(controller.session.serialize()).setup.deck,
      ...controller.state,
    };
  });
  const terminalScreenshot = resolve(ARTIFACTS, 'restart-terminal.png');
  await restartPage.screenshot({ path: terminalScreenshot, animations: 'disabled' });
  const terminalPng = await readFile(terminalScreenshot);
  restarted = {
    terminal,
    terminalScreenshot,
    terminalScreenshotByteLength: terminalPng.length,
    terminalScreenshotSha256: createHash('sha256').update(terminalPng).digest('hex'),
    restartErrors,
    restartConsoleMessages,
  };
  writeReport();
  assert.equal(terminal.terminal, true, 'the shipped deterministic terminal witness reaches restart');
  await restartFrame.locator('[data-ui="restart"]').waitFor({ state: 'visible' });
  await restartFrame.locator('[data-ui="restart"]').click();
  await restartFrame.waitForFunction(() =>
    globalThis.__copperskiffGameController.state.restartCount === 1 &&
    globalThis.__copperskiffGameController.state.sessionTick === 0);
  const restartResult = await restartFrame.evaluate(() => ({
    deck: JSON.parse(globalThis.__copperskiffGameController.session.serialize()).setup.deck,
    restartCount: globalThis.__copperskiffGameController.state.restartCount,
    sessionTick: globalThis.__copperskiffGameController.state.sessionTick,
  }));
  const restartedScreenshot = resolve(ARTIFACTS, 'restart-after-click.png');
  await restartPage.screenshot({ path: restartedScreenshot, animations: 'disabled' });
  restarted.afterRestart = {
    ...restartResult,
    screenshot: restartedScreenshot,
    screenshotSha256: createHash('sha256').update(await readFile(restartedScreenshot)).digest('hex'),
  };
  writeReport();
  assert.equal(restartResult.restartCount, 1);
  assert.equal(restartResult.sessionTick, 0);
  assert.deepEqual(restartResult.deck, terminal.deck,
    'restart preserves the app default deck used by the deterministic terminal witness');
  assert.deepEqual(restartErrors, []);
  await restartPage.close();
  await restartContext.close();

  writeReport();
  if (checkpointPng === null) {
    assert.fail('the live Copperskiff checkpoint screenshot was not captured');
  }
});
