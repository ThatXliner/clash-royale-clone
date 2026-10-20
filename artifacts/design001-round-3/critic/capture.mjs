import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const evidenceDir = path.dirname(fileURLToPath(import.meta.url));
const repo = '/Users/me/.codex/worktrees/9456/clash-royale-clone';
const board = path.join(evidenceDir, 'input', 'design-board.html');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const playwrightModule = path.join(repo, 'node_modules/playwright/index.mjs');
const expectedBoardSha256 = '427788064b231af280b8c67a271c63bf0daeb8ce86879f41a361a6587218d2e4';
const frames = [
  { id: 'f-phone-landing', width: 390, height: 844 },
  { id: 'f-phone-deck', width: 390, height: 844 },
  { id: 'f-phone-battle', width: 390, height: 844 },
  { id: 'f-desk-landing', width: 1440, height: 933 },
  { id: 'f-desk-deck', width: 1440, height: 933 },
  { id: 'f-desk-battle', width: 1440, height: 933 },
];
const criticalSelectors = [
  '.pl-nav', '.pl-art', '.pl-copy', '.pl-copy h1', '.pl-copy .lede', '.pl-copy .btn',
  '.howto', '.hstep', '.hstep__vis', '.hstep h3', '.hstep p', '.pl-foot',
  '.app-bar', '.seg', '.deck-grid', '.deck-grid .ct-wrap', '.deck-grid .ct__name',
  '.sheet', '.sheet .ci-head', '.sheet .does', '.sheet .chips', '.sheet .stats',
  '.sheet .specimen', '.sheet .sheet__actions', '.bt-top', '.arena-frame', '.bt-sel',
  '.bt-hand', '.bt-hand .ct-wrap', '.bt-hand .ct__name', '.rail',
  '.dl-nav', '.dl-copy', '.dl-how', '.dl-how .hstep', '.dl-how .hstep h3', '.dl-how .hstep p',
  '.dd', '.dd-main', '.dd-head', '.dd-sub', '.dd-deck', '.dd-deck .ct-wrap',
  '.dd-deck .ct__name', '.dd-coll', '.dd-coll .ct-wrap', '.dd-coll .ct__name', '.dd-panel',
  '.dd-panel .does', '.dd-panel .stats', '.dd-panel .specimen', '.dd-panel .actions',
  '.db', '.db-left', '.db-center', '.db-right', '.db-left .panel', '.db-right .panel',
  '.db-hand', '.db-hand .ct-wrap', '.db-hand .ct__name', '.db-center .arena-frame',
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function compactError(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function getPlatformFonts(cdp, selector) {
  try {
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    const { nodeId } = await cdp.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector,
    });
    if (!nodeId) return { selector, fonts: [], error: 'selector did not match' };
    const result = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    return { selector, fonts: result.fonts };
  } catch (error) {
    return { selector, fonts: [], error: compactError(error) };
  }
}

async function measureFrame(page, frameId) {
  return page.locator(`#${frameId}`).evaluate((frame, selectors) => {
    const rect = (element) => {
      const r = element.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        pageX: r.x + window.scrollX,
        pageY: r.y + window.scrollY,
        width: r.width,
        height: r.height,
        top: r.top,
        right: r.right,
        bottom: r.bottom,
        left: r.left,
      };
    };
    const text = (element) => (element.textContent || '').replace(/\s+/g, ' ').trim();
    const frameStyle = getComputedStyle(frame);
    const frameRect = frame.getBoundingClientRect();
    const selected = [];
    for (const selector of selectors) {
      const matches = frame.matches(selector)
        ? [frame]
        : Array.from(frame.querySelectorAll(selector));
      if (matches.length === 0) continue;
      for (const element of matches) {
        const style = getComputedStyle(element);
        selected.push({
          selector,
          tag: element.tagName.toLowerCase(),
          id: element.id || null,
          className: typeof element.className === 'string' ? element.className : null,
          text: text(element).slice(0, 180),
          rect: rect(element),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          clientHeight: element.clientHeight,
          scrollHeight: element.scrollHeight,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          whiteSpace: style.whiteSpace,
          textOverflow: style.textOverflow,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          color: style.color,
          backgroundColor: style.backgroundColor,
        });
      }
    }
    const escapes = [];
    for (const element of frame.querySelectorAll('*')) {
      const r = element.getBoundingClientRect();
      if (r.left < frameRect.left - 0.5 || r.right > frameRect.right + 0.5 ||
          r.top < frameRect.top - 0.5 || r.bottom > frameRect.bottom + 0.5) {
        const style = getComputedStyle(element);
        let clipping = [];
        for (let ancestor = element.parentElement; ancestor && ancestor !== frame.parentElement; ancestor = ancestor.parentElement) {
          const s = getComputedStyle(ancestor);
          if (/(hidden|clip|auto|scroll)/.test(`${s.overflowX} ${s.overflowY}`)) {
            const a = ancestor.getBoundingClientRect();
            clipping.push({
              id: ancestor.id || null,
              className: typeof ancestor.className === 'string' ? ancestor.className : null,
              overflowX: s.overflowX,
              overflowY: s.overflowY,
              rect: { left: a.left, right: a.right, top: a.top, bottom: a.bottom },
            });
          }
        }
        escapes.push({
          tag: element.tagName.toLowerCase(),
          id: element.id || null,
          className: typeof element.className === 'string' ? element.className : null,
          text: text(element).slice(0, 100),
          rect: rect(element),
          position: style.position,
          transform: style.transform,
          clippingAncestors: clipping,
        });
      }
    }
    const styleSheets = Array.from(document.styleSheets, (sheet) => sheet.href);
    const fontFaceCount = Array.from(document.styleSheets).reduce((count, sheet) => {
      try {
        return count + Array.from(sheet.cssRules).filter((rule) => rule.type === CSSRule.FONT_FACE_RULE).length;
      } catch {
        return count;
      }
    }, 0);
    return {
      frame: {
        id: frame.id,
        rect: rect(frame),
        cssWidth: frameStyle.width,
        cssHeight: frameStyle.height,
        boxSizing: frameStyle.boxSizing,
        transform: frameStyle.transform,
        zoom: frameStyle.zoom,
        overflowX: frameStyle.overflowX,
        overflowY: frameStyle.overflowY,
        clientWidth: frame.clientWidth,
        scrollWidth: frame.scrollWidth,
        clientHeight: frame.clientHeight,
        scrollHeight: frame.scrollHeight,
      },
      viewport: {
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
        visualViewport: window.visualViewport ? {
          width: window.visualViewport.width,
          height: window.visualViewport.height,
          scale: window.visualViewport.scale,
        } : null,
      },
      fontFacts: {
        documentFontsStatus: document.fonts.status,
        documentFontFaceCount: document.fonts.size,
        cssFontFaceRuleCount: fontFaceCount,
        styleSheetHrefs: styleSheets,
        bodyComputedFont: getComputedStyle(document.body).fontFamily,
        frameComputedFont: frameStyle.fontFamily,
      },
      selected,
      frameEscapingDescendantCount: escapes.length,
      frameEscapingDescendants: escapes.slice(0, 120),
    };
  }, criticalSelectors);
}

async function readPngSize(file) {
  const bytes = await readFile(file);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

const evidence = {
  startedAt: new Date().toISOString(),
  runner: {
    path: fileURLToPath(import.meta.url),
    sha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  },
  input: {
    path: board,
    sha256: sha256(await readFile(board)),
    expectedSha256: expectedBoardSha256,
  },
  process: {
    pid: process.pid,
    ppid: process.ppid,
    execPath: process.execPath,
    argv: process.argv,
    cwd: process.cwd(),
    nodeVersion: process.version,
    relevantEnvironment: Object.fromEntries([
      'PATH', 'TMPDIR', 'HOME', 'LANG', 'LC_ALL', 'TZ',
    ].map((key) => [key, process.env[key] ?? null])),
  },
  browserExecutable: chrome,
  playwrightModule,
  frames: [],
  auditCaptures: [],
  collectionScrollEvidence: null,
  requests: [],
  consoleMessages: [],
  pageErrors: [],
  requestFailures: [],
};

await mkdir(path.join(evidenceDir, 'raw', 'normal'), { recursive: true });
await mkdir(path.join(evidenceDir, 'raw', 'audit'), { recursive: true });
if (evidence.input.sha256 !== expectedBoardSha256) {
  throw new Error(`candidate HTML hash ${evidence.input.sha256} does not match granted hash ${expectedBoardSha256}`);
}

const { chromium } = await import(pathToFileURL(playwrightModule).href);
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: chrome });
  evidence.browserVersion = browser.version();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  });
  const page = await context.newPage();
  page.on('request', (request) => evidence.requests.push({
    url: request.url(),
    resourceType: request.resourceType(),
    isNavigationRequest: request.isNavigationRequest(),
  }));
  page.on('requestfailed', (request) => evidence.requestFailures.push({
    url: request.url(),
    error: request.failure()?.errorText || null,
  }));
  page.on('console', (message) => evidence.consoleMessages.push({
    type: message.type(),
    text: message.text(),
  }));
  page.on('pageerror', (error) => evidence.pageErrors.push(compactError(error)));
  await page.goto(pathToFileURL(board).href, { waitUntil: 'load' });
  const cdp = await context.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');

  for (const frame of frames) {
    const record = { ...frame, id: frame.id };
    try {
      await page.setViewportSize({ width: frame.width, height: frame.height });
      const locator = page.locator(`#${frame.id}`);
      await locator.scrollIntoViewIfNeeded();
      record.beforeScreenshotMetrics = await measureFrame(page, frame.id);
      record.actualFonts = [];
      for (const selector of [
        `#${frame.id} .display`,
        `#${frame.id} .eyebrow`,
        `#${frame.id} .ct__name`,
        `#${frame.id} .does`,
        `#${frame.id} .hstep p`,
      ]) {
        const result = await getPlatformFonts(cdp, selector);
        if (!result.error || result.error !== 'selector did not match') record.actualFonts.push(result);
      }
      const png = path.join(evidenceDir, 'raw', 'normal', `${frame.id}.png`);
      await locator.screenshot({ path: png, scale: 'css', animations: 'disabled' });
      record.png = { path: png, ...(await readPngSize(png)) };
      record.pngExpected = { width: frame.width, height: frame.height };
      record.pngDimensionDelta = {
        width: record.png.width - frame.width,
        height: record.png.height - frame.height,
      };
      record.afterScreenshotMetrics = await measureFrame(page, frame.id);
    } catch (error) {
      record.captureError = compactError(error);
      evidence.captureErrors ||= [];
      evidence.captureErrors.push({ id: frame.id, error: record.captureError });
    }
    evidence.frames.push(record);
  }

  // Exercise the bounded desktop collection with keyboard focus and retain a bottom-state frame.
  await page.setViewportSize({ width: 1440, height: 933 });
  const desktopDeck = page.locator('#f-desk-deck');
  await desktopDeck.scrollIntoViewIfNeeded();
  const collection = page.locator('#f-desk-deck .dd-coll-scroll');
  const collectionState = () => collection.evaluate((element) => {
    const panel = element.getBoundingClientRect();
    const cards = Array.from(element.querySelectorAll('[data-card-id]'));
    const visibleIds = cards.filter((card) => {
      const r = card.getBoundingClientRect();
      return r.bottom > panel.top && r.top < panel.bottom &&
        r.right > panel.left && r.left < panel.right;
    }).map((card) => card.dataset.cardId);
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    return {
      activeElementIsRegion: document.activeElement === element,
      role: element.getAttribute('role'),
      ariaLabel: element.getAttribute('aria-label'),
      tabIndex: element.tabIndex,
      overflowY: getComputedStyle(element).overflowY,
      scrollTop: element.scrollTop,
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
      maxScrollTop,
      atBottom: element.scrollTop >= maxScrollTop - 1,
      cardCount: cards.length,
      cardIds: cards.map((card) => card.dataset.cardId),
      visibleIds,
      lastCardVisible: visibleIds.includes(cards.at(-1)?.dataset.cardId),
    };
  });
  await collection.focus();
  const focusConfirmed = await collection.evaluate((element) => document.activeElement === element);
  const atTop = await collectionState();
  await page.keyboard.press('PageDown');
  const afterPageDown = await collectionState();
  await page.keyboard.press('End');
  const atBottom = await collectionState();
  const scrollPng = path.join(evidenceDir, 'raw', 'collection-scroll', 'f-desk-deck-bottom.png');
  await desktopDeck.screenshot({ path: scrollPng, scale: 'css', animations: 'disabled' });
  evidence.collectionScrollEvidence = {
    focusConfirmed,
    keys: ['PageDown', 'End'],
    atTop,
    afterPageDown,
    atBottom,
    screenshot: { path: scrollPng, ...(await readPngSize(scrollPng)) },
    expectedScreenshot: { width: 1440, height: 933, deviceScaleFactor: 1 },
  };

  // The audit hash only reveals overflow outside the frame's normal clipping.
  // Screenshots stay at CSS scale 1; this is an inspection viewport, not a resized frame.
  await page.setViewportSize({ width: 1536, height: 1200 });
  await page.goto(`${pathToFileURL(board).href}#audit`, { waitUntil: 'load' });
  for (const frame of frames) {
    const record = { id: frame.id, viewport: { width: 1536, height: 1200 }, scale: 'CSS pixels at DPR 1' };
    try {
      const locator = page.locator(`#${frame.id}`);
      await locator.evaluate((element) => {
        const r = element.getBoundingClientRect();
        const pageX = r.x + window.scrollX;
        const pageY = r.y + window.scrollY;
        window.scrollTo(Math.max(0, pageX - 48), Math.max(0, pageY - 80));
      });
      record.metrics = await measureFrame(page, frame.id);
      const png = path.join(evidenceDir, 'raw', 'audit', `${frame.id}-audit-viewport.png`);
      await page.screenshot({ path: png, animations: 'disabled' });
      record.png = { path: png, ...(await readPngSize(png)) };
    } catch (error) {
      record.captureError = compactError(error);
      evidence.captureErrors ||= [];
      evidence.captureErrors.push({ id: `${frame.id}#audit`, error: record.captureError });
    }
    evidence.auditCaptures.push(record);
  }
  evidence.fontAndNetworkSummary = {
    requestCount: evidence.requests.length,
    externalHttpRequestCount: evidence.requests.filter(({ url }) => /^https?:/i.test(url)).length,
    fontRequestCount: evidence.requests.filter(({ resourceType }) => resourceType === 'font').length,
    documentFontFaceApiCount: evidence.frames[0]?.beforeScreenshotMetrics?.fontFacts?.documentFontFaceCount ?? null,
    cssFontFaceRuleCount: evidence.frames[0]?.beforeScreenshotMetrics?.fontFacts?.cssFontFaceRuleCount ?? null,
  };
  await cdp.detach();
  await context.close();
} catch (error) {
  evidence.fatalError = compactError(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch((error) => {
    evidence.browserCloseError = compactError(error);
    process.exitCode = 1;
  });
}
evidence.finishedAt = new Date().toISOString();
const out = path.join(evidenceDir, 'browser-evidence.json');
await writeFile(out, `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  evidencePath: out,
  browserVersion: evidence.browserVersion ?? null,
  frameCount: evidence.frames.length,
  captures: evidence.frames.map(({ id, png, captureError }) => ({
    id,
    png: png ? { width: png.width, height: png.height, bytes: png.bytes, sha256: png.sha256 } : null,
    captureError: captureError || null,
  })),
  auditCaptureCount: evidence.auditCaptures.length,
  requestCount: evidence.requests.length,
  fontRequestCount: evidence.fontAndNetworkSummary?.fontRequestCount ?? null,
  pageErrors: evidence.pageErrors,
  captureErrors: evidence.captureErrors || [],
  fatalError: evidence.fatalError || null,
}, null, 2)}\n`);
