import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const evidenceDir = path.dirname(fileURLToPath(import.meta.url));
const sourceRoot = path.join(evidenceDir, 'input');
const artifactRoot = path.join(evidenceDir, 'output', 'pages');
const outputDir = path.join(evidenceDir, 'output', 'native-captures');
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const playwrightModule = '/Users/me/.codex/clash-qualification/20261020-design-r4-site-critic/site/input/node_modules/playwright/index.mjs';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function compactError(error) {
  return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
}

async function pngFacts(file) {
  const bytes = await readFile(file);
  return {
    path: file,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    bytes: bytes.length,
    sha256: sha256(bytes),
  };
}

async function readPageFacts(page) {
  return page.evaluate(() => {
    const visible = (element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };
    const rect = (element) => {
      const r = element.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height, top: r.top, right: r.right, bottom: r.bottom, left: r.left };
    };
    const active = document.activeElement;
    const activeStyle = active instanceof Element ? getComputedStyle(active) : null;
    const headings = Array.from(document.querySelectorAll('h1,h2,h3')).map((element) => ({
      level: Number(element.tagName.slice(1)), text: element.textContent.replace(/\s+/gu, ' ').trim(),
      visible: visible(element), rect: rect(element),
    }));
    const links = Array.from(document.querySelectorAll('a[href]')).map((element) => ({
      text: element.textContent.replace(/\s+/gu, ' ').trim(),
      ariaLabel: element.getAttribute('aria-label'),
      href: element.getAttribute('href'),
      target: element.getAttribute('target'),
      visible: visible(element),
      rect: rect(element),
    }));
    const focusables = Array.from(document.querySelectorAll(
      'a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])',
    )).filter(visible);
    const focusStyle = activeStyle ? {
      outlineStyle: activeStyle.outlineStyle,
      outlineWidth: activeStyle.outlineWidth,
      outlineColor: activeStyle.outlineColor,
      outlineOffset: activeStyle.outlineOffset,
      boxShadow: activeStyle.boxShadow,
    } : null;
    const overflowing = Array.from(document.querySelectorAll('body *')).map((element) => {
      const r = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (r.width === 0 || r.height === 0 ||
          (r.left >= -0.5 && r.right <= innerWidth + 0.5)) return null;
      return {
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === 'string' ? element.className : null,
        text: element.textContent.replace(/\s+/gu, ' ').trim().slice(0, 100),
        rect: rect(element),
        overflowX: style.overflowX,
      };
    }).filter(Boolean);
    return {
      title: document.title,
      lang: document.documentElement.lang,
      viewport: {
        innerWidth,
        innerHeight,
        devicePixelRatio,
        visualViewportScale: visualViewport?.scale ?? null,
      },
      document: {
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
        clientWidth: document.documentElement.clientWidth,
        clientHeight: document.documentElement.clientHeight,
        scrollX,
        scrollY,
      },
      landmarks: {
        headerCount: document.querySelectorAll('header').length,
        navCount: document.querySelectorAll('nav').length,
        mainCount: document.querySelectorAll('main').length,
        footerCount: document.querySelectorAll('footer').length,
        skipLinkCount: Array.from(document.querySelectorAll('a')).filter((item) => item.textContent.trim() === 'Skip to content').length,
      },
      headings,
      links,
      visibleFocusableCount: focusables.length,
      activeElement: active instanceof Element ? {
        tag: active.tagName.toLowerCase(),
        text: active.textContent.replace(/\s+/gu, ' ').trim().slice(0, 120),
        ariaLabel: active.getAttribute('aria-label'),
        href: active.getAttribute('href'),
        matchesFocusVisible: active.matches(':focus-visible'),
        rect: rect(active),
        style: focusStyle,
      } : null,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      overflowingElements: overflowing.slice(0, 60),
      externalStylesheets: Array.from(document.styleSheets, (sheet) => sheet.href).filter((href) =>
        href && new URL(href, location.href).origin !== location.origin),
      cssFontFaceRuleCount: Array.from(document.styleSheets).reduce((count, sheet) => {
        try { return count + Array.from(sheet.cssRules).filter((rule) => rule.type === CSSRule.FONT_FACE_RULE).length; }
        catch { return count; }
      }, 0),
    };
  });
}

const evidence = {
  startedAt: new Date().toISOString(),
  runner: {
    path: fileURLToPath(import.meta.url),
    sha256: sha256(await readFile(fileURLToPath(import.meta.url))),
  },
  source: {
    gitCommit: '4b18faf1f163244d592cdde6c82ea8ef06041b5e',
    sourceRoot,
    artifactRoot,
  },
  process: {
    pid: process.pid,
    ppid: process.ppid,
    execPath: process.execPath,
    argv: process.argv,
    cwd: process.cwd(),
    nodeVersion: process.version,
    relevantEnvironment: Object.fromEntries([
      'PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ', 'GAME_BROWSER_CHROME', 'GAME_BROWSER_PLAYWRIGHT',
    ].map((key) => [key, process.env[key] ?? null])),
  },
  browserExecutable: chrome,
  playwrightModule,
  viewports: [],
  requests: [],
  requestFailures: [],
  consoleErrors: [],
  pageErrors: [],
  navigation: null,
};

await mkdir(outputDir, { recursive: true });
const { chromium } = await import(pathToFileURL(playwrightModule).href);
const { createPagesPreviewServer } = await import(
  pathToFileURL(path.join(sourceRoot, 'scripts/preview-pages.js')).href,
);
const { server } = await createPagesPreviewServer({
  root: artifactRoot,
  basePath: '/clash-royale-clone/',
});
await new Promise((resolve, reject) => {
  server.once('error', reject);
  server.listen(0, '127.0.0.1', resolve);
});
const address = server.address();
const landingUrl = `http://127.0.0.1:${address.port}/clash-royale-clone/`;
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: chrome });
  evidence.browserVersion = browser.version();
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  page.on('request', (request) => evidence.requests.push({
    url: request.url(), resourceType: request.resourceType(), isNavigationRequest: request.isNavigationRequest(),
  }));
  page.on('requestfailed', (request) => evidence.requestFailures.push({
    url: request.url(), error: request.failure()?.errorText ?? null,
  }));
  page.on('console', (message) => {
    if (message.type() === 'error') evidence.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => evidence.pageErrors.push(compactError(error)));

  evidence.navigation = {
    requestedUrl: landingUrl,
    status: await page.goto(landingUrl, { waitUntil: 'networkidle' }).then((response) => response?.status() ?? null),
    finalUrl: page.url(),
  };
  await page.evaluate(() => document.fonts.ready.then(() => true));

  for (const viewport of [
    { id: 'phone', width: 390, height: 844 },
    { id: 'desktop', width: 1440, height: 933 },
  ]) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(landingUrl, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    const record = { ...viewport, deviceScaleFactor: 1, top: await readPageFacts(page) };
    record.screenshots = {};
    const viewportPng = path.join(outputDir, `${viewport.id}-landing-${viewport.width}x${viewport.height}.png`);
    const fullPagePng = path.join(outputDir, `${viewport.id}-landing-full.png`);
    await page.screenshot({ path: viewportPng, animations: 'disabled' });
    await page.screenshot({ path: fullPagePng, fullPage: true, animations: 'disabled' });
    record.screenshots.viewport = await pngFacts(viewportPng);
    record.screenshots.fullPage = await pngFacts(fullPagePng);

    const tabStops = [];
    for (let index = 0; index < record.top.visibleFocusableCount; index += 1) {
      await page.keyboard.press('Tab');
      tabStops.push(await page.evaluate(() => {
        const element = document.activeElement;
        if (!(element instanceof Element)) return null;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          text: element.textContent.replace(/\s+/gu, ' ').trim(),
          href: element.getAttribute('href'),
          visible: rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < innerHeight,
          matchesFocusVisible: element.matches(':focus-visible'),
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          outline: { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor },
        };
      }));
      if (index === 0) {
        const focusPng = path.join(outputDir, `${viewport.id}-keyboard-first-focus.png`);
        await page.screenshot({ path: focusPng, animations: 'disabled' });
        record.screenshots.firstKeyboardFocus = await pngFacts(focusPng);
      }
    }
    record.tabStops = tabStops;
    record.endAfterTabs = await readPageFacts(page);

    await page.getByRole('link', { name: 'How to play' }).click();
    record.howToNavigation = {
      hash: await page.evaluate(() => location.hash),
      scrollY: await page.evaluate(() => scrollY),
      targetVisible: await page.locator('#how').evaluate((element) => {
        const r = element.getBoundingClientRect();
        return r.top >= 0 && r.top < innerHeight;
      }),
    };
    const howPng = path.join(outputDir, `${viewport.id}-how-to.png`);
    await page.screenshot({ path: howPng, animations: 'disabled' });
    record.screenshots.howTo = await pngFacts(howPng);
    evidence.viewports.push(record);
  }

  const playPage = await context.newPage();
  const playResponse = await playPage.goto(landingUrl, { waitUntil: 'networkidle' });
  const playLink = playPage.getByRole('link', { name: /Play the demo/u }).first();
  await Promise.all([
    playPage.waitForNavigation({ waitUntil: 'load' }),
    playLink.click(),
  ]);
  evidence.navigation.playDemo = {
    sourceStatus: playResponse?.status() ?? null,
    destinationUrl: playPage.url(),
    destinationTitle: await playPage.title(),
    destinationStatus: await playPage.evaluate(() => document.readyState),
  };
  await context.close();
} catch (error) {
  evidence.fatalError = compactError(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch((error) => {
    evidence.browserCloseError = compactError(error);
    process.exitCode = 1;
  });
  await new Promise((resolve) => server.close(resolve));
}

evidence.finishedAt = new Date().toISOString();
const outputFile = path.join(evidenceDir, 'output', 'native-browser-evidence.json');
await writeFile(outputFile, `${JSON.stringify(evidence, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({
  evidencePath: outputFile,
  browserVersion: evidence.browserVersion ?? null,
  navigation: evidence.navigation,
  viewports: evidence.viewports.map(({ id, width, height, top, screenshots, tabStops, howToNavigation }) => ({
    id, width, height,
    documentSize: { scrollWidth: top.document.scrollWidth, scrollHeight: top.document.scrollHeight },
    horizontalOverflow: top.horizontalOverflow,
    links: top.links.length,
    visibleFocusableCount: top.visibleFocusableCount,
    tabStops: tabStops.length,
    focusVisibleCount: tabStops.filter((item) => item?.matchesFocusVisible).length,
    screenshot: screenshots.viewport,
    fullPageScreenshot: screenshots.fullPage,
    howToNavigation,
  })),
  externalRequests: evidence.requests.filter(({ url }) => /^https?:/iu.test(url) && !url.startsWith('http://127.0.0.1:')),
  requestFailures: evidence.requestFailures,
  consoleErrors: evidence.consoleErrors,
  pageErrors: evidence.pageErrors,
  fatalError: evidence.fatalError ?? null,
}, null, 2)}\n`);
