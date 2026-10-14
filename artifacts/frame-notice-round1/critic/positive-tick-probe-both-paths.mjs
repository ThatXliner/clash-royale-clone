import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createEditableGameSessionSetup } from '../../../src/content/editable-deck.js';
import { GameSession } from '../../../src/sim/game-session.js';
import { createShippedGameSessionSetup } from '../../../src/ui/game-browser-entry.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ARTIFACTS = fileURLToPath(new URL('./positive-tick-both/', import.meta.url));
const CHROME = process.env.GAME_BROWSER_CHROME ??
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE_DECK = [
  'coilblade', 'mossguard', 'copperskiff', 'skymaul',
  'brassbolt', 'reedsting', 'briar-band',
];
const TICKS = 600;
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
};
const setupFor = (cardId) => cardId === null
  ? createShippedGameSessionSetup(0)
  : createEditableGameSessionSetup([...BASE_DECK, cardId], 0);
const stepped = (setup) => {
  const session = new GameSession(setup);
  session.stepMany(TICKS);
  return session;
};
const expectedNotice = (sessionBytes) => {
  const setup = JSON.parse(JSON.parse(sessionBytes).setup.battleSetup);
  const card = setup.roster.find(({ buildingRuntime }) =>
    buildingRuntime?.class === 'defensive' &&
    buildingRuntime.policy?.disposition === 'question');
  if (!card) return { cardId: null, disposition: null, hidden: true,
    text: '', unverifiedFields: null };
  const fields = card.buildingRuntime.policy.corpusFields;
  return {
    cardId: card.id,
    disposition: 'question',
    hidden: false,
    text: `${card.displayName} combat: QUESTION. First-hit timing is ${fields.firstHitTicks.value === null
      ? 'absent' : 'unverified'}; damage, HP, deploy, range and target fields are unverified.`,
    unverifiedFields: Object.entries(fields)
      .filter(([, record]) => record.authoritative !== true)
      .map(([field]) => field).join(','),
  };
};
const digest = (value) => createHash('sha256').update(value).digest('hex');
const server = spawn(process.execPath, [
  fileURLToPath(new URL('../../../tests/game-browser-journey-server.js', import.meta.url)),
  `--root=${ROOT}`,
], { stdio: ['ignore', 'pipe', 'pipe'] });
let browser;
try {
  const { chromium } = await import('playwright');
  let buffered = '';
  const ready = await new Promise((resolve, reject) => {
    server.stdout.setEncoding('utf8');
    server.stdout.on('data', (chunk) => {
      buffered += chunk;
      const end = buffered.indexOf('\n');
      if (end >= 0) resolve(JSON.parse(buffered.slice(0, end)));
    });
    server.once('exit', (code) => reject(new Error(`server exited ${code}: ${buffered}`)));
  });
  browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const context = await browser.newContext({ deviceScaleFactor: 1,
    viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  await page.goto(`http://${ready.host}:${ready.port}/public/ui-arena-shell.html?app-frame=1`,
    { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    document.querySelector('[data-arena-shell-root] [data-ui="arena"]') !== null);

  const emberSession = stepped(setupFor('ember-basin'));
  const defaultSession = stepped(setupFor(null));
  const expected = {
    ember: emberSession.serialize(),
    defaultEight: defaultSession.serialize(),
  };
  assert.equal(emberSession.state.tick, TICKS);
  assert.equal(defaultSession.state.tick, TICKS);

  await page.evaluate(async ({ expected, buriedSetup }) => {
    const { arenaHudController } = await import('/src/ui/arena-shell-entry.js');
    const { GameSession } = await import('/src/sim/game-session.js');
    const { mountShippedGameBrowser } = await import('/src/ui/game-browser-entry.js');
    let rafCount = 0;
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => {
      rafCount += 1;
      return nativeRequestAnimationFrame(callback);
    };
    arenaHudController.dispose();
    const root = document.querySelector('[data-arena-shell-root]');
    const controller = mountShippedGameBrowser(root, window, new GameSession(buriedSetup));
    if (!controller.enterManualStepMode()) throw new Error('target did not enter manual mode');
    const sources = Object.create(null);
    for (const name of ['ember', 'defaultEight']) {
      const sourceRoot = document.createElement('div');
      const source = mountShippedGameBrowser(sourceRoot, window,
        GameSession.restore(expected[name]));
      if (!source.enterManualStepMode()) throw new Error(`${name} source did not enter manual mode`);
      sources[name] = {
        browserBytes: source.serialize(),
        audioContinuationBytes: source.audioContinuationBytes,
        sessionBytes: source.session.serialize(),
      };
      source.dispose();
    }
    const read = () => {
      const bytes = controller.serialize();
      const node = root.querySelector('[data-ui="policy-question"]');
      return {
        audioContinuationBytes: controller.audioContinuationBytes,
        browserBytes: bytes,
        inputContinuationBytes: JSON.parse(bytes).bridge,
        notice: node ? { cardId: node.dataset.cardId ?? null,
          disposition: node.dataset.disposition ?? null, hidden: node.hidden,
          text: node.textContent, unverifiedFields: node.dataset.unverifiedFields ?? null } : null,
        sessionBytes: controller.session.serialize(),
        state: controller.state,
      };
    };
    window.__frameNoticePositiveProbe = { controller, read, rafCount: () => rafCount, sources,
      yieldPolicy: controller.enduranceYieldPolicy };
  }, { expected, buriedSetup: setupFor('buried-coil') });

  const sources = await page.evaluate(() => window.__frameNoticePositiveProbe.sources);
  const doRestore = async (method, bytes) => page.evaluate(async ({ method, bytes }) => {
    const probe = window.__frameNoticePositiveProbe;
    const beforeRafCount = probe.rafCount();
    if (method === 'yielding') await probe.controller.restoreEndurance(bytes);
    else probe.controller.restore(bytes);
    return { afterRafCount: probe.rafCount(), beforeRafCount, value: probe.read() };
  }, { method, bytes });
  const emberSync = await doRestore('sync', sources.ember.browserBytes);
  const emberSyncPng = await page.screenshot({ fullPage: false });
  const emberYielding = await doRestore('yielding', sources.ember.browserBytes);
  const emberYieldingPng = await page.screenshot({ fullPage: false });
  const defaultSync = await doRestore('sync', sources.defaultEight.browserBytes);
  const defaultPng = await page.screenshot({ fullPage: false });
  const defaultYielding = await doRestore('yielding', sources.defaultEight.browserBytes);
  const defaultYieldingPng = await page.screenshot({ fullPage: false });
  const disposeOk = await page.evaluate(() => window.__frameNoticePositiveProbe.controller.dispose());

  mkdirSync(ARTIFACTS, { recursive: true });
  const savePng = (name, bytes) => {
    const path = join(ARTIFACTS, name);
    writeFileSync(path, bytes);
    return { bytes: bytes.length, path, sha256: digest(bytes) };
  };
  const screenshots = {
    emberSync: savePng('ember-sync-600.png', emberSyncPng),
    emberYielding: savePng('ember-yielding-600.png', emberYieldingPng),
    defaultEight: savePng('default-eight-600.png', defaultPng),
    defaultEightYielding: savePng('default-eight-yielding-600.png', defaultYieldingPng),
  };
  const checkNotice = (actual, expectedValue) => JSON.stringify(actual) === JSON.stringify(expectedValue);
  const output = {
    browserVersion: browser.version(),
    ticks: TICKS,
    source: Object.fromEntries(Object.entries(expected).map(([name, bytes]) => [name, {
      bytes: bytes.length, sha256: digest(bytes), tick: JSON.parse(bytes).transcript.length,
    }])),
    restoreYields: {
      synchronous: emberSync.afterRafCount - emberSync.beforeRafCount,
      yielding: emberYielding.afterRafCount - emberYielding.beforeRafCount,
      defaultYielding: defaultYielding.afterRafCount - defaultYielding.beforeRafCount,
    },
    enduranceYieldPolicy: await page.evaluate(() =>
      window.__frameNoticePositiveProbe?.yieldPolicy ?? null),
    checks: {
      emberSourceSession: sources.ember.sessionBytes === expected.ember,
      emberSyncSession: emberSync.value.sessionBytes === expected.ember,
      emberYieldingSession: emberYielding.value.sessionBytes === expected.ember,
      emberSyncBrowser: emberSync.value.browserBytes === sources.ember.browserBytes,
      emberYieldingBrowser: emberYielding.value.browserBytes === sources.ember.browserBytes,
      emberSyncInput: emberSync.value.inputContinuationBytes === JSON.parse(sources.ember.browserBytes).bridge,
      emberYieldingInput: emberYielding.value.inputContinuationBytes === JSON.parse(sources.ember.browserBytes).bridge,
      emberSyncAudio: emberSync.value.audioContinuationBytes === sources.ember.audioContinuationBytes,
      emberYieldingAudio: emberYielding.value.audioContinuationBytes === sources.ember.audioContinuationBytes,
      emberSyncNotice: checkNotice(emberSync.value.notice, expectedNotice(expected.ember)),
      emberYieldingNotice: checkNotice(emberYielding.value.notice, expectedNotice(expected.ember)),
      defaultSession: defaultSync.value.sessionBytes === expected.defaultEight,
      defaultBrowser: defaultSync.value.browserBytes === sources.defaultEight.browserBytes,
      defaultInput: defaultSync.value.inputContinuationBytes === JSON.parse(sources.defaultEight.browserBytes).bridge,
      defaultAudio: defaultSync.value.audioContinuationBytes === sources.defaultEight.audioContinuationBytes,
      defaultNotice: checkNotice(defaultSync.value.notice, expectedNotice(expected.defaultEight)),
      defaultYieldingSession: defaultYielding.value.sessionBytes === expected.defaultEight,
      defaultYieldingBrowser: defaultYielding.value.browserBytes === sources.defaultEight.browserBytes,
      defaultYieldingInput: defaultYielding.value.inputContinuationBytes ===
        JSON.parse(sources.defaultEight.browserBytes).bridge,
      defaultYieldingAudio: defaultYielding.value.audioContinuationBytes ===
        sources.defaultEight.audioContinuationBytes,
      defaultYieldingNotice: checkNotice(defaultYielding.value.notice, expectedNotice(expected.defaultEight)),
      defaultYieldingPngEqual: defaultPng.equals(defaultYieldingPng),
      defaultYieldObserved: defaultYielding.afterRafCount > defaultYielding.beforeRafCount,
      emberPngEqual: emberSyncPng.equals(emberYieldingPng),
      positiveYieldObserved: emberYielding.afterRafCount > emberYielding.beforeRafCount,
      disposeOk,
    },
    state: {
      emberSync: emberSync.value.state,
      emberYielding: emberYielding.value.state,
      defaultSync: defaultSync.value.state,
      defaultYielding: defaultYielding.value.state,
    },
    screenshots,
  };
  writeFileSync(join(ARTIFACTS, 'evidence.json'), `${JSON.stringify(output, null, 2)}\n`);
  console.log(JSON.stringify(output, null, 2));
  assert.equal(Object.values(output.checks).every(Boolean), true,
    `positive tick restore probe failed: ${JSON.stringify(output.checks)}`);
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    server.kill('SIGTERM');
    await once(server, 'exit').catch(() => {});
  }
}
