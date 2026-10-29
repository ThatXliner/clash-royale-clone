import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { ARENA_LENGTH_MILLITILES, ARENA_WIDTH_MILLITILES } from '../src/sim/arena-geometry.js';
import { COMBAT_ART_ARCHETYPES } from '../src/ui/combat-art.js';
const OUT = process.env.VISUAL_COMBAT_ASSETS_OUT ??
  new URL('../artifacts/visual-003c-round-3/', import.meta.url).pathname;
const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ?? '/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs';

function finalizeVisualEvidence(result) {
  for (const art of result.art ?? []) {
    const capture = art.rasterCapture;
    if (!capture || !Array.isArray(capture.alphaMaskBytes)) continue;
    const maskBytes = Buffer.from(capture.alphaMaskBytes);
    capture.alphaMaskSha256 = createHash('sha256').update(maskBytes).digest('hex');
    capture.alphaMaskBase64 = maskBytes.toString('base64');
    delete capture.alphaMaskBytes;
    capture.sourceSvgSha256 = createHash('sha256')
      .update(capture.sourceSvgMarkup, 'utf8')
      .digest('hex');
  }
  return result;
}

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
    const result = await page.evaluate(async ({ kinds, arenaLength, arenaWidth }) => {
      const rowsPerColumn = 7;
      const columnCount = Math.ceil(kinds.length / rowsPerColumn);
      const { createCombatViewModel, bindCombatViewModel, serializeCombatViewModel, restoreCombatViewModel } = await import('/src/ui/combat-state.js');
      const { arenaHudController } = await import('/src/ui/arena-shell-entry.js');
      arenaHudController.enterManualStepMode();
      const arena = document.querySelector('[data-ui="arena"]');
      const layer = document.querySelector('[data-game-browser-layer="combat"]');
      const entities = ['north', 'south'].flatMap((side, sideIndex) => kinds.map((kind, i) => ({
        id: sideIndex * kinds.length + i + 1, kind, side, layer: ['skymaul','copperskiff'].includes(kind) ? 'air' : 'ground',
        position: {
          x: Math.round(arenaWidth * (Math.floor(i / rowsPerColumn) + 1) / (columnCount + 1)),
          y: (sideIndex === 0 ? 30000 : 12800) - (i % rowsPerColumn) * 1800,
        },
        hitpoints: 70, maxHitpoints: 100, targetId: null,
      })));
      const fixturePositions = entities.map(({ position }) => position);
      const fixturePositionKeys = fixturePositions.map(({ x, y }) => [x, y].join(','));
      const fixtureIds = entities.map(({ id }) => id);
      const fixtureAudit = {
        allPositionsInBounds: fixturePositions.every(({ x, y }) =>
          Number.isSafeInteger(x) && x >= 0 && x <= arenaWidth &&
          Number.isSafeInteger(y) && y >= 0 && y <= arenaLength),
        positionCount: fixturePositions.length,
        uniqueEntityIdCount: new Set(fixtureIds).size,
        uniquePositionCount: new Set(fixturePositionKeys).size,
      };
      entities[0].targetId = entities[kinds.length].id;
      const view = createCombatViewModel({ entities, towers: [], events: [], tick: 400 });
      bindCombatViewModel(layer, view);
      const before = layer.innerHTML;
      bindCombatViewModel(layer, restoreCombatViewModel(serializeCombatViewModel(view)));
      const restored = before === layer.innerHTML;
      const rect = arena.getBoundingClientRect();
      const artNodes = [...layer.querySelectorAll('.combat-art')];
      const originalSvgMarkup = artNodes.map(svg => svg.outerHTML);
      const sceneBeforeCapture = layer.innerHTML;
      const fixtureInputsBeforeCapture = JSON.stringify(entities);
      const imagePinsByUrl = new Map();
      const rasterSize = 64;
      const fetchImagePin = async rawHref => {
        const sourceUrl = new URL(rawHref, document.baseURI);
        if (sourceUrl.origin !== location.origin) {
          throw new Error(`combat image must be same-origin: ${sourceUrl.href}`);
        }
        let pending = imagePinsByUrl.get(sourceUrl.href);
        if (!pending) {
          pending = (async () => {
            const response = await fetch(sourceUrl.href, { cache: 'no-store', credentials: 'same-origin' });
            if (!response.ok || new URL(response.url).origin !== location.origin) {
              throw new Error(`combat image fetch failed: ${response.status} ${sourceUrl.href}`);
            }
            const bytes = new Uint8Array(await response.arrayBuffer());
            const servedContentType = (response.headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
            const extension = sourceUrl.pathname.slice(sourceUrl.pathname.lastIndexOf('.')).toLowerCase();
            const extensionMime = { '.png': 'image/png', '.webp': 'image/webp' }[extension] ?? null;
            const contentType = servedContentType.startsWith('image/')
              ? servedContentType
              : servedContentType === 'application/octet-stream' ? extensionMime : null;
            const isPng = bytes.length >= 8 &&
              [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((byte, index) => bytes[index] === byte);
            const isWebp = bytes.length >= 12 &&
              String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
              String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP';
            if ((contentType === 'image/png' && !isPng) ||
                (contentType === 'image/webp' && !isWebp) ||
                !['image/png', 'image/webp'].includes(contentType)) {
              throw new Error(`combat image MIME/signature mismatch: ${servedContentType || 'missing MIME type'} ${sourceUrl.href}`);
            }
            const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
            const sha256 = [...digest].map(value => value.toString(16).padStart(2, '0')).join('');
            let binary = '';
            for (let offset = 0; offset < bytes.length; offset += 0x8000) {
              binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
            }
            return {
              dataUrl: `data:${contentType};base64,${btoa(binary)}`,
              pin: {
                byteLength: bytes.length,
                mimeType: contentType,
                mimeTypeSource: servedContentType === contentType ? 'response-header' : 'extension-and-magic-bytes',
                responseUrl: response.url,
                sha256,
                sourceHref: rawHref,
                resolvedUrl: sourceUrl.href,
              },
            };
          })();
          imagePinsByUrl.set(sourceUrl.href, pending);
        }
        return pending;
      };
      const rasterize = async svg => {
        const sourceSvgMarkup = svg.outerHTML;
        const rootStyle = getComputedStyle(svg);
        const originalRootStyle = Object.fromEntries([
          'bottom', 'clip-path', 'display', 'filter', 'height', 'left', 'mask',
          'opacity', 'overflow', 'position', 'right', 'top', 'transform',
          'translate', 'visibility', 'width',
        ].map(property => [property, rootStyle.getPropertyValue(property)]));
        const clone = svg.cloneNode(true);
        const sourceElements = [svg, ...svg.querySelectorAll('*')];
        const cloneElements = [clone, ...clone.querySelectorAll('*')];
        const visualProperties = [
          'clip-path', 'clip-rule', 'display', 'fill', 'fill-opacity', 'fill-rule',
          'color', 'filter', 'image-rendering', 'mask', 'mix-blend-mode', 'opacity',
          'overflow', 'paint-order', 'pointer-events', 'shape-rendering', 'stroke',
          'stroke-dasharray',
          'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity',
          'stroke-miterlimit', 'stroke-width', 'transform', 'transform-box',
          'transform-origin', 'vector-effect', 'visibility',
        ];
        const computedStyleEvidence = [];
        if (sourceElements.length !== cloneElements.length) {
          throw new Error('SVG clone element count changed before raster capture');
        }
        for (let index = 0; index < sourceElements.length; index += 1) {
          const computed = getComputedStyle(sourceElements[index]);
          const target = cloneElements[index];
          const visualStyle = Object.fromEntries(visualProperties.map(property => [
            property, computed.getPropertyValue(property),
          ]));
          computedStyleEvidence.push({
            elementIndex: index,
            tagName: sourceElements[index].tagName,
            visualStyle,
          });
          for (let propertyIndex = 0; propertyIndex < computed.length; propertyIndex += 1) {
            const property = computed.item(propertyIndex);
            if (property.startsWith('--')) continue;
            const value = computed.getPropertyValue(property);
            if (value) target.style.setProperty(property, value);
          }
        }
        const normalizedRootProperties = {
          height: `${rasterSize}px`,
          bottom: 'auto',
          left: 'auto',
          position: 'static',
          right: 'auto',
          top: 'auto',
          translate: 'none',
          width: `${rasterSize}px`,
        };
        clone.setAttribute('width', String(rasterSize));
        clone.setAttribute('height', String(rasterSize));
        for (const [property, value] of Object.entries(normalizedRootProperties)) {
          clone.style.setProperty(property, value);
        }

        const imagePins = [];
        const pinnedImageSources = [];
        const sourceImages = [...svg.querySelectorAll('image')];
        const cloneImages = [...clone.querySelectorAll('image')];
        if (sourceImages.length !== cloneImages.length) {
          throw new Error('SVG clone image count changed before raster capture');
        }
        const xlinkNamespace = 'http://www.w3.org/1999/xlink';
        for (let index = 0; index < sourceImages.length; index += 1) {
          const sourceImage = sourceImages[index];
          const cloneImage = cloneImages[index];
          const href = sourceImage.getAttribute('href') ??
            sourceImage.getAttributeNS(xlinkNamespace, 'href');
          if (!href) throw new Error('painted SVG image has no href');
          const pinned = await fetchImagePin(href);
          cloneImage.setAttribute('href', pinned.dataUrl);
          if (sourceImage.hasAttributeNS(xlinkNamespace, 'href')) {
            cloneImage.setAttributeNS(xlinkNamespace, 'xlink:href', pinned.dataUrl);
          }
          imagePins.push({
            ...pinned.pin,
            elementIndex: index,
            x: sourceImage.getAttribute('x'),
            y: sourceImage.getAttribute('y'),
            width: sourceImage.getAttribute('width'),
            height: sourceImage.getAttribute('height'),
            viewBox: svg.getAttribute('viewBox'),
          });
          pinnedImageSources.push({ dataUrl: pinned.dataUrl, pin: pinned.pin });
        }

        const serializedSvg = new XMLSerializer().serializeToString(clone);
        const serializedSvgBytes = new TextEncoder().encode(serializedSvg);
        const serializedSvgDigest = new Uint8Array(await crypto.subtle.digest('SHA-256', serializedSvgBytes));
        const serializedSvgSha256 = [...serializedSvgDigest]
          .map(value => value.toString(16).padStart(2, '0')).join('');
        const objectUrl = URL.createObjectURL(new Blob([serializedSvg], { type: 'image/svg+xml;charset=utf-8' }));
        try {
          const decoded = new Image();
          decoded.src = objectUrl;
          await decoded.decode();
          const canvas = document.createElement('canvas');
          canvas.width = rasterSize;
          canvas.height = rasterSize;
          const context = canvas.getContext('2d', { willReadFrequently: true });
          if (!context) throw new Error('Canvas2D context is unavailable');
          context.clearRect(0, 0, rasterSize, rasterSize);
          context.drawImage(decoded, 0, 0, rasterSize, rasterSize);
          const rgba = context.getImageData(0, 0, rasterSize, rasterSize).data;
          const alphaMaskBytes = new Array(rasterSize * rasterSize);
          let maskArea = 0;
          let minX = rasterSize;
          let minY = rasterSize;
          let maxX = -1;
          let maxY = -1;
          for (let pixel = 0; pixel < alphaMaskBytes.length; pixel += 1) {
            const occupied = rgba[pixel * 4 + 3] > 0;
            alphaMaskBytes[pixel] = occupied ? 1 : 0;
            if (!occupied) continue;
            const x = pixel % rasterSize;
            const y = Math.floor(pixel / rasterSize);
            maskArea += 1;
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
          let teamColorCoverage = null;
          if (svg.dataset.artId === 'copperskiff' || svg.dataset.artId === 'stormkite') {
            const [cellX, cellY, cellWidth, cellHeight] = svg.getAttribute('viewBox')
              .trim().split(/[ ,]+/u).map(Number);
            const pinnedAtlas = pinnedImageSources[0];
            const expectedAtlasSha256 = svg.dataset.artId === 'stormkite'
              ? '05ff6a0db991026211427136b6dbf7d0a2fbe8e8849bca141af308083ff14e6e'
              : '45ee8feefc4c4dc94ea7e94a8cac1e4b6e69c723fb730fb34a9866098dd7485a';
            if (!pinnedAtlas || pinnedAtlas.pin.sha256 !== expectedAtlasSha256) {
              throw new Error(`${svg.dataset.artId} team-color evidence is not using the pinned battle-atlas bytes`);
            }
            const atlas = new Image();
            atlas.src = pinnedAtlas.dataUrl;
            await atlas.decode();
            const cellCanvas = document.createElement('canvas');
            cellCanvas.width = rasterSize;
            cellCanvas.height = rasterSize;
            const cellContext = cellCanvas.getContext('2d', { willReadFrequently: true });
            if (!cellContext) throw new Error(`${svg.dataset.artId} atlas Canvas2D context is unavailable`);
            cellContext.clearRect(0, 0, rasterSize, rasterSize);
            cellContext.drawImage(
              atlas, cellX, cellY, cellWidth, cellHeight,
              0, 0, rasterSize, rasterSize,
            );
            const cellPixels = cellContext.getImageData(0, 0, rasterSize, rasterSize).data;
            const palette = svg.dataset.spriteTeam === 'ember'
              ? { hex: '#C6452E', rgb: [198, 69, 46] }
              : svg.dataset.spriteTeam === 'river'
                ? { hex: '#2E7F86', rgb: [46, 127, 134] }
                : null;
            if (!palette || atlas.naturalWidth !== 256 || atlas.naturalHeight !== 256 ||
                cellWidth !== 64 || cellHeight !== 64) {
              throw new Error(`${svg.dataset.artId} team-color evidence has an unexpected team or atlas cell`);
            }
            let opaquePixelCount = 0;
            let teamColorPixelCount = 0;
            let nearestTeamColorDistance = Number.POSITIVE_INFINITY;
            for (let pixel = 0; pixel < rasterSize * rasterSize; pixel += 1) {
              const offset = pixel * 4;
              const alpha = cellPixels[offset + 3];
              if (alpha <= 16) continue;
              opaquePixelCount += 1;
              const distance = Math.hypot(
                cellPixels[offset] - palette.rgb[0],
                cellPixels[offset + 1] - palette.rgb[1],
                cellPixels[offset + 2] - palette.rgb[2],
              );
              nearestTeamColorDistance = Math.min(nearestTeamColorDistance, distance);
              if (distance <= 64) teamColorPixelCount += 1;
            }
            teamColorCoverage = {
              algorithm: 'Decode the exact pinned PNG data URL, crop the recorded 64x64 atlas viewBox, then count source pixels with alpha > 16 and RGB distance <= 64 from the accepted side palette.',
              atlasDecodedSize: { width: atlas.naturalWidth, height: atlas.naturalHeight },
              cell: { x: cellX, y: cellY, width: cellWidth, height: cellHeight },
              imageSha256: pinnedAtlas.pin.sha256,
              minimumRequiredPixels: 4,
              nearestTeamColorDistance: Number.isFinite(nearestTeamColorDistance)
                ? nearestTeamColorDistance : null,
              opaquePixelCount,
              paletteHex: palette.hex,
              radiusRgb: 64,
              team: svg.dataset.spriteTeam,
              teamColorPixelCount,
              viewport: { width: rasterSize, height: rasterSize },
            };
          }
          return {
            alphaMaskBytes,
            algorithm: 'Canvas2D decoded RGBA; row-major binary mask where alpha > 0',
            computedStyleEvidence,
            imagePins,
            maskArea,
            maskBounds: maskArea === 0 ? null : {
              x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1,
            },
            normalizedRootProperties,
            originalRootStyle,
            provenance: 'Detached clone of the rendered combat SVG; computed render styles copied to clone; same-origin image bytes fetched and inlined as data URLs; SVG decoded with Image.decode(); rasterized on transparent 64x64 Canvas2D.',
            serializedSvgByteLength: serializedSvgBytes.length,
            serializedSvgSha256,
            sourceGeometry: {
              clipPathReferences: [...svg.querySelectorAll('[clip-path]')].map(node => ({
                clipPath: node.getAttribute('clip-path'),
                tagName: node.tagName,
              })),
              preserveAspectRatio: svg.getAttribute('preserveAspectRatio'),
              rootOpacity: originalRootStyle.opacity,
              viewBox: svg.getAttribute('viewBox'),
            },
            sourceSvgMarkup,
            viewport: { height: rasterSize, width: rasterSize },
            decodedSize: { height: decoded.naturalHeight, width: decoded.naturalWidth },
            teamColorCoverage,
          };
        } finally {
          URL.revokeObjectURL(objectUrl);
        }
      };
      const art = await Promise.all(artNodes.map(async svg => {
        const marker = svg.parentNode;
        const markerRect = marker.getBoundingClientRect();
        const artRect = svg.getBoundingClientRect();
        const presentationDataset = document.documentElement.dataset;
        const presentationContextFromDefaults =
          presentationDataset.combatBodyCssPixels === undefined &&
          presentationDataset.combatFrameScale === undefined;
        const resolvedPresentationBodyCssPixels = presentationContextFromDefaults
          ? 13 : Number(presentationDataset.combatBodyCssPixels);
        const resolvedFrameScale = presentationContextFromDefaults
          ? 1 : Number(presentationDataset.combatFrameScale);
        const paintedAtlas = svg.querySelector('image');
        const imageElements = [...svg.querySelectorAll('image')].map(image => ({
          height: image.getAttribute('height'),
          href: image.getAttribute('href') ?? image.getAttributeNS('http://www.w3.org/1999/xlink', 'href'),
          preserveAspectRatio: image.getAttribute('preserveAspectRatio'),
          width: image.getAttribute('width'),
          x: image.getAttribute('x'),
          y: image.getAttribute('y'),
        }));
        const vectorShapes = [...svg.querySelectorAll('ellipse, rect')].map(shape => {
          const computed = getComputedStyle(shape);
          return {
            attributes: Object.fromEntries([...shape.attributes].map(attribute =>
              [attribute.name, attribute.value])),
            computedFill: computed.fill,
            computedStroke: computed.stroke,
            computedStrokeWidth: computed.strokeWidth,
            tagName: shape.tagName.toLowerCase(),
          };
        });
        const paths = [...svg.querySelectorAll('path')];
        const pathData = paths.map(path => ({
          d: path.getAttribute('d'),
          fill: path.getAttribute('fill'),
          stroke: path.getAttribute('stroke'),
        }));
        let rasterCapture;
        try {
          rasterCapture = await rasterize(svg);
        } catch (error) {
          rasterCapture = {
            captureError: error?.stack ?? String(error),
            imagePins: [],
            provenance: 'Capture failed; raw failure retained before visual assertions.',
            viewport: { height: rasterSize, width: rasterSize },
          };
        }
        return {
          kind: svg.dataset.artId,
          markerKind: marker.dataset.kind,
          imageHref: paintedAtlas?.getAttribute('href') ?? null,
          painted: paintedAtlas !== null,
          side: marker.dataset.side,
          spriteAction: svg.dataset.spriteAction ?? null,
          spriteDirection: svg.dataset.spriteDirection ?? null,
          spriteFrame: svg.dataset.spriteFrame ?? null,
          spriteSide: svg.dataset.spriteSide ?? null,
          spriteTeam: svg.dataset.spriteTeam ?? null,
          spritePivot: svg.dataset.pivot ?? null,
          spriteBodyCssPixels: svg.dataset.bodyCssPixels === undefined
            ? null : Number(svg.dataset.bodyCssPixels),
          presentationBodyCssPixels: presentationDataset.combatBodyCssPixels === undefined
            ? null : Number(presentationDataset.combatBodyCssPixels),
          presentationFrameScale: presentationDataset.combatFrameScale === undefined
            ? null : Number(presentationDataset.combatFrameScale),
          presentationContextFromDefaults,
          resolvedPresentationBodyCssPixels,
          frameScale: resolvedFrameScale,
          rootViewBox: svg.getAttribute('viewBox'),
          rootPreserveAspectRatio: svg.getAttribute('preserveAspectRatio'),
          spriteStyle: {
            height: svg.style.height,
            left: svg.style.left,
            pointerEvents: svg.style.pointerEvents,
            top: svg.style.top,
            translate: svg.style.translate,
            width: svg.style.width,
          },
          imageElements,
          vectorShapes,
          renderGeometry: {
            art: { x: artRect.x, y: artRect.y, width: artRect.width, height: artRect.height },
            marker: {
              x: markerRect.x, y: markerRect.y,
              width: markerRect.width, height: markerRect.height,
            },
            pivotErrorX: artRect.x + artRect.width / 2 - (markerRect.x + markerRect.width / 2),
            pivotErrorY: artRect.y + artRect.height * 0.84375 -
              (markerRect.y + markerRect.height / 2),
          },
          paths: pathData.map(path => path.d).join('|'),
          pathData,
          healthHeight: marker.querySelector(".combat-health").getBoundingClientRect().height,
          width: svg.getBoundingClientRect().width,
          height: svg.getBoundingClientRect().height,
          rasterCapture,
        };
      }));
      const sceneUnchanged = layer.innerHTML === sceneBeforeCapture;
      const originalNodesUnchanged = artNodes.every((svg, index) => svg.outerHTML === originalSvgMarkup[index]);
      const linksHidden = [...layer.querySelectorAll('.combat-target-link')].every(n => getComputedStyle(n).display === 'none');
      for (const node of layer.querySelectorAll('.combat-marker')) {
        const label = document.createElement('b'); label.textContent = node.dataset.kind;
        label.style.cssText = 'position:absolute;top:110%;left:50%;translate:-50% 0;font:10px sans-serif;white-space:nowrap;color:#191D22;background:#F4EBD6'; node.append(label);
      }
      return {
        restored, linksHidden, art, arenaWidth: rect.width, fixtureAudit,
        captureAudit: {
          originalNodesUnchanged,
          sceneUnchanged,
          fixtureInputsUnchanged: JSON.stringify(entities) === fixtureInputsBeforeCapture,
          successfulCaptureCount: art.filter(entry => !entry.rasterCapture.captureError).length,
          failedCaptures: art.filter(entry => entry.rasterCapture.captureError).map(entry => ({
            kind: entry.kind, side: entry.side, error: entry.rasterCapture.captureError,
          })),
        },
      };
    }, {
      arenaLength: ARENA_LENGTH_MILLITILES,
      arenaWidth: ARENA_WIDTH_MILLITILES,
      kinds: COMBAT_ART_ARCHETYPES,
    });
    finalizeVisualEvidence(result);
    result.captureAudit = {
      ...result.captureAudit,
      evidencePersistedBeforeAssertions: true,
      alphaMaskSize: '64x64',
    };
    writeFileSync(`${OUT}render-evidence.json`, JSON.stringify(result, null, 2));
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
    assert.equal(result.captureAudit.sceneUnchanged, true,
      'alpha-mask capture must leave the rendered fixture scene unchanged');
    assert.equal(result.captureAudit.originalNodesUnchanged, true,
      'alpha-mask capture must leave original SVG nodes unchanged');
    assert.equal(result.captureAudit.fixtureInputsUnchanged, true,
      'alpha-mask capture must leave fixture source inputs unchanged');
    assert.equal(result.captureAudit.failedCaptures.length, 0,
      JSON.stringify(result.captureAudit.failedCaptures, null, 2));
    assert.equal(result.art.length, COMBAT_ART_ARCHETYPES.length * 2);
    for (const art of result.art) {
      const pins = art.rasterCapture.imagePins;
      assert.equal(art.painted, pins.length > 0,
        `${art.side} ${art.kind} image references must be represented in raster evidence`);
      if (pins.length > 0) {
        assert.equal(art.imageHref, pins[0].resolvedUrl,
          `${art.side} ${art.kind} must retain its actual image source URL`);
      }
      assert.ok(pins.every(pin => pin.byteLength > 0 && /^[0-9a-f]{64}$/u.test(pin.sha256)),
        `${art.side} ${art.kind} must retain hashes for exact fetched image bytes`);
    }
    const expectedFixtureCount = COMBAT_ART_ARCHETYPES.length * 2;
    assert.equal(result.fixtureAudit.positionCount, expectedFixtureCount);
    assert.equal(result.fixtureAudit.uniquePositionCount, expectedFixtureCount);
    assert.equal(result.fixtureAudit.uniqueEntityIdCount, expectedFixtureCount);
    assert.equal(result.fixtureAudit.allPositionsInBounds, true);
    const expectedMapping = ['north', 'south'].flatMap(side =>
      COMBAT_ART_ARCHETYPES.map(kind => ({ kind, markerKind: kind, side })));
    assert.deepEqual(result.art.map(({ kind, markerKind, side }) =>
      ({ kind, markerKind, side })), expectedMapping,
    'every rendered team variant must map to its registry kind and side');
    for (const side of ['north', 'south']) {
      const teamArt = result.art.filter(art => art.side === side);
      assert.equal(teamArt.length, COMBAT_ART_ARCHETYPES.length,
        `${side} must render every registered archetype exactly once`);
      assert.ok(teamArt.every(art => art.rasterCapture.maskArea > 0 &&
        art.rasterCapture.maskBounds && art.rasterCapture.alphaMaskBase64 &&
        art.rasterCapture.alphaMaskSha256 &&
        Buffer.from(art.rasterCapture.alphaMaskBase64, 'base64').length === 64 * 64),
      `${side} must retain non-empty decoded alpha-mask evidence for every archetype`);
      assert.equal(new Set(teamArt.map(art => art.rasterCapture.alphaMaskBase64)).size,
        COMBAT_ART_ARCHETYPES.length,
        `${side} must retain a distinct silhouette for every archetype`);
    }
    const artBySideAndKind = new Map(result.art.map(art =>
      [`${art.side}\0${art.kind}`, art]));
    for (const kind of COMBAT_ART_ARCHETYPES) {
      const north = artBySideAndKind.get(`north\0${kind}`);
      const south = artBySideAndKind.get(`south\0${kind}`);
      assert.deepEqual(
        north.rasterCapture.imagePins.map(({ byteLength, resolvedUrl, sha256 }) =>
          ({ byteLength, resolvedUrl, sha256 })),
        south.rasterCapture.imagePins.map(({ byteLength, resolvedUrl, sha256 }) =>
          ({ byteLength, resolvedUrl, sha256 })),
        `${kind} must use the same pinned image bytes for both team variants`,
      );
    }
    for (const kind of COMBAT_ART_ARCHETYPES) {
      const north = artBySideAndKind.get(`north\0${kind}`);
      const south = artBySideAndKind.get(`south\0${kind}`);
      if (kind === 'briar-runner') {
        for (const [side, direction, sprite] of [
          ['north', 'south', north],
          ['south', 'north', south],
        ]) {
          assert.equal(sprite.painted, true, `${side} Briar Runner must use the painted atlas`);
          assert.equal(sprite.imageHref,
            `http://${ready.host}:${ready.port}/public/assets/briar-runner-painted-sheet.png`);
          assert.equal(sprite.spriteAction, 'walk');
          assert.equal(sprite.spriteDirection, direction);
          assert.equal(sprite.spriteFrame, `briar-walk-${direction}-0`);
        }
        continue;
      }
      if (kind === 'copperskiff') {
        const atlasSha256 = '45ee8feefc4c4dc94ea7e94a8cac1e4b6e69c723fb730fb34a9866098dd7485a';
        for (const [side, direction, team, viewBox, alphaBounds, sprite] of [
          ['north', 'south', 'ember', '128 0 64 64',
            { x: 24, y: 42, width: 15, height: 15 }, north],
          ['south', 'north', 'river', '64 128 64 64',
            { x: 24, y: 40, width: 15, height: 16 }, south],
        ]) {
          assert.equal(sprite.painted, true, `${side} Copperskiff must use the baked team atlas`);
          assert.equal(sprite.imageHref,
            `http://${ready.host}:${ready.port}/public/assets/copperskiff-battle-sprite.png`);
          assert.equal(sprite.spriteSide, side);
          assert.equal(sprite.spriteTeam, team);
          assert.equal(sprite.spriteAction, 'idle');
          assert.equal(sprite.spriteDirection, direction);
          assert.equal(sprite.spriteFrame, `copperskiff-${team}-${direction}-idle`);
          assert.equal(sprite.rootViewBox, viewBox);
          assert.equal(sprite.rootPreserveAspectRatio, 'none');
          assert.equal(sprite.spritePivot, '32:54');
          assert.ok([13, 26].includes(sprite.spriteBodyCssPixels),
            `${side} Copperskiff must keep an approved 13px or 26px body presentation`);
          assert.equal(sprite.resolvedPresentationBodyCssPixels, sprite.spriteBodyCssPixels,
            `${side} Copperskiff data and resolved presentation context must agree`);
          assert.ok(Number.isFinite(sprite.frameScale) && sprite.frameScale > 0 &&
            sprite.frameScale <= 8,
          `${side} Copperskiff must retain the bounded presentation frame scale`);
          const expectedFrameCssPixels = 64 * sprite.spriteBodyCssPixels / 13 / sprite.frameScale;
          assert.ok(Math.abs(Number.parseFloat(sprite.spriteStyle.width) - expectedFrameCssPixels) < 0.01);
          assert.equal(sprite.spriteStyle.width, sprite.spriteStyle.height);
          assert.equal(sprite.spriteStyle.left, '50%');
          assert.equal(sprite.spriteStyle.top, '50%');
          assert.equal(sprite.spriteStyle.translate, '-50% -84.375%');
          assert.equal(sprite.spriteStyle.pointerEvents, 'none');
          assert.ok(Math.abs(sprite.renderGeometry.art.width - expectedFrameCssPixels) < 0.01);
          assert.ok(Math.abs(sprite.renderGeometry.art.height - expectedFrameCssPixels) < 0.01);
          assert.ok(Math.abs(sprite.renderGeometry.pivotErrorX) < 0.01);
          assert.ok(Math.abs(sprite.renderGeometry.pivotErrorY) < 0.01);
          assert.ok(Math.abs(sprite.renderGeometry.art.width * sprite.frameScale -
            64 * sprite.spriteBodyCssPixels / 13) < 0.01);
          assert.deepEqual(sprite.rasterCapture.maskBounds, alphaBounds,
            `${side} Copperskiff keeps the measured visible atlas bounds`);
          assert.equal(sprite.imageElements.length, 1);
          assert.deepEqual(sprite.imageElements[0], {
            height: '256',
            href: sprite.imageHref,
            preserveAspectRatio: 'none',
            width: '256',
            x: '0',
            y: '0',
          });
          const pin = sprite.rasterCapture.imagePins[0];
          assert.equal(pin.sha256, atlasSha256,
            `${side} Copperskiff must retain the accepted source atlas bytes`);
          assert.equal(pin.byteLength, 12094);
          const coverage = sprite.rasterCapture.teamColorCoverage;
          assert.ok(coverage, `${side} Copperskiff must retain decoded team-color evidence`);
          assert.equal(coverage.imageSha256, atlasSha256);
          assert.equal(coverage.team, team);
          assert.equal(coverage.paletteHex, team === 'ember' ? '#C6452E' : '#2E7F86');
          assert.equal(coverage.radiusRgb, 64);
          assert.equal(coverage.minimumRequiredPixels, 4);
          assert.deepEqual(coverage.cell, {
            x: Number(viewBox.split(' ')[0]),
            y: Number(viewBox.split(' ')[1]),
            width: 64,
            height: 64,
          });
          assert.ok(coverage.opaquePixelCount > 0);
          assert.ok(coverage.teamColorPixelCount >= coverage.minimumRequiredPixels,
            `${side} Copperskiff's pinned atlas cell must contain decoded ${team} palette coverage`);
        }
        continue;
      }
      if (kind === 'skymaul') {
        const atlasSha256 = 'e6c02d3a0ce4634f060f508cca00f72a729551805536dc0a80930a74bf7b3fcb';
        for (const [side, direction, team, row, column, sprite] of [
          ['north', 'south', 'ember', 3, 2, north],
          ['south', 'north', 'river', 0, 1, south],
        ]) {
          const viewBox = `${column * 64} ${row * 64} 64 64`;
          assert.equal(sprite.painted, true, `${side} Skymaul must use the accepted atlas`);
          assert.equal(sprite.imageHref,
            `http://${ready.host}:${ready.port}/public/assets/skymaul-battle-sprite.png`);
          assert.equal(sprite.spriteSide, side);
          assert.equal(sprite.spriteTeam, team);
          assert.equal(sprite.spriteAction, 'idle');
          assert.equal(sprite.spriteDirection, direction);
          assert.equal(sprite.spriteFrame, `skymaul-${team}-${direction}-idle`);
          assert.equal(sprite.rootViewBox, viewBox);
          assert.equal(sprite.rootPreserveAspectRatio, 'none');
          assert.equal(sprite.spritePivot, '32:54');
          assert.ok([13, 26].includes(sprite.spriteBodyCssPixels),
            `${side} Skymaul must keep an approved 13px or 26px body presentation`);
          assert.equal(sprite.resolvedPresentationBodyCssPixels, sprite.spriteBodyCssPixels,
            `${side} Skymaul data and resolved presentation context must agree`);
          assert.ok(Number.isFinite(sprite.frameScale) && sprite.frameScale > 0 &&
            sprite.frameScale <= 8,
          `${side} Skymaul must retain the bounded presentation frame scale`);
          const expectedFrameCssPixels = 64 * sprite.spriteBodyCssPixels / 13 / sprite.frameScale;
          assert.ok(Math.abs(Number.parseFloat(sprite.spriteStyle.width) - expectedFrameCssPixels) < 0.01);
          assert.equal(sprite.spriteStyle.width, sprite.spriteStyle.height);
          assert.equal(sprite.spriteStyle.left, '50%');
          assert.equal(sprite.spriteStyle.top, '50%');
          assert.equal(sprite.spriteStyle.translate, '-50% -84.375%');
          assert.equal(sprite.spriteStyle.pointerEvents, 'none');
          assert.ok(Math.abs(sprite.renderGeometry.art.width - expectedFrameCssPixels) < 0.01);
          assert.ok(Math.abs(sprite.renderGeometry.art.height - expectedFrameCssPixels) < 0.01);
          assert.ok(Math.abs(sprite.renderGeometry.pivotErrorX) < 0.01);
          assert.ok(Math.abs(sprite.renderGeometry.pivotErrorY) < 0.01);
          assert.ok(Math.abs(sprite.renderGeometry.art.width * sprite.frameScale -
            64 * sprite.spriteBodyCssPixels / 13) < 0.01);
          assert.ok(sprite.rasterCapture.maskArea > 0 && sprite.rasterCapture.maskBounds,
            `${side} Skymaul must retain decoded visible-alpha evidence`);
          assert.equal(sprite.imageElements.length, 1);
          assert.deepEqual(sprite.imageElements[0], {
            height: '384',
            href: sprite.imageHref,
            preserveAspectRatio: 'none',
            width: '256',
            x: '0',
            y: '0',
          });
          assert.equal(sprite.pathData.length, 0,
            `${side} Skymaul body must remain the accepted raster atlas`);
          const pin = sprite.rasterCapture.imagePins[0];
          assert.equal(sprite.rasterCapture.imagePins.length, 1);
          assert.equal(pin.sha256, atlasSha256,
            `${side} Skymaul must retain the accepted source atlas bytes`);
          assert.equal(pin.byteLength, 27488);
        }
        continue;
      }
      if (kind === 'stormkite') {
        const atlasSha256 = '05ff6a0db991026211427136b6dbf7d0a2fbe8e8849bca141af308083ff14e6e';
        for (const [side, direction, team, viewBox, sprite] of [
          ['north', 'south', 'ember', '128 0 64 64', north],
          ['south', 'north', 'river', '64 128 64 64', south],
        ]) {
          assert.equal(sprite.painted, true, `${side} Stormkite must use its accepted team atlas`);
          assert.equal(sprite.pathData.length, 0);
          assert.equal(sprite.vectorShapes.length, 0);
          assert.equal(sprite.spriteSide, side);
          assert.equal(sprite.spriteTeam, team);
          assert.equal(sprite.spriteAction, 'idle');
          assert.equal(sprite.spriteDirection, direction);
          assert.equal(sprite.spriteFrame, `stormkite-${team}-${direction}-idle`);
          assert.equal(sprite.rootViewBox, viewBox);
          assert.equal(sprite.rootPreserveAspectRatio, 'none');
          assert.equal(sprite.spritePivot, '32:54');
          assert.ok([13, 26].includes(sprite.spriteBodyCssPixels));
          assert.equal(sprite.resolvedPresentationBodyCssPixels, sprite.spriteBodyCssPixels);
          assert.ok(Number.isFinite(sprite.frameScale) && sprite.frameScale > 0 && sprite.frameScale <= 8);
          const expectedFrameCssPixels = 64 * sprite.spriteBodyCssPixels / 13 / sprite.frameScale;
          assert.ok(Math.abs(Number.parseFloat(sprite.spriteStyle.width) - expectedFrameCssPixels) < 0.01);
          assert.equal(sprite.spriteStyle.width, sprite.spriteStyle.height);
          assert.equal(sprite.spriteStyle.left, '50%');
          assert.equal(sprite.spriteStyle.top, '50%');
          assert.equal(sprite.spriteStyle.translate, '-50% -84.375%');
          assert.equal(sprite.spriteStyle.pointerEvents, 'none');
          assert.ok(Math.abs(sprite.renderGeometry.art.width - expectedFrameCssPixels) < 0.01);
          assert.ok(Math.abs(sprite.renderGeometry.art.height - expectedFrameCssPixels) < 0.01);
          assert.ok(Math.abs(sprite.renderGeometry.pivotErrorX) < 0.01);
          assert.ok(Math.abs(sprite.renderGeometry.pivotErrorY) < 0.01);
          assert.equal(sprite.imageHref,
            `http://${ready.host}:${ready.port}/public/assets/stormkite-battle-sprite.png`);
          assert.deepEqual(sprite.imageElements, [{
            height: '256', href: sprite.imageHref, preserveAspectRatio: 'none',
            width: '256', x: '0', y: '0',
          }]);
          assert.equal(sprite.rasterCapture.imagePins.length, 1);
          assert.equal(sprite.rasterCapture.imagePins[0].sha256, atlasSha256);
          assert.equal(sprite.rasterCapture.imagePins[0].byteLength, 9325);
          const coverage = sprite.rasterCapture.teamColorCoverage;
          assert.ok(coverage, `${side} Stormkite must retain decoded team-color evidence`);
          assert.equal(coverage.imageSha256, atlasSha256);
          assert.equal(coverage.team, team);
          assert.equal(coverage.paletteHex, team === 'ember' ? '#C6452E' : '#2E7F86');
          assert.equal(coverage.radiusRgb, 64);
          assert.equal(coverage.minimumRequiredPixels, 4);
          assert.deepEqual(coverage.cell, {
            x: Number(viewBox.split(' ')[0]), y: Number(viewBox.split(' ')[1]),
            width: 64, height: 64,
          });
          assert.ok(coverage.opaquePixelCount > 0);
          assert.ok(coverage.teamColorPixelCount >= coverage.minimumRequiredPixels,
            `${side} Stormkite's pinned atlas cell must contain decoded ${team} palette coverage`);
        }
        continue;
      }
      if (kind === 'kilnkeeper') {
        const imageSha256 = '43766c813461acbfe36a949c6a972ba4e5ddf07513276bd5079cf564b1bf157a';
        assert.equal(north.painted, true);
        assert.equal(south.painted, true);
        assert.equal(north.rootViewBox, '0 0 512 512');
        assert.equal(south.rootViewBox, '0 0 512 512');
        assert.equal(north.pathData.length, 0);
        assert.equal(south.pathData.length, 0);
        assert.deepEqual(north.imageElements, [{
          height: '512',
          href: north.imageHref,
          preserveAspectRatio: 'xMidYMid meet',
          width: '512',
          x: '0',
          y: '0',
        }]);
        assert.deepEqual(south.imageElements, north.imageElements,
          'Kilnkeeper must keep the same body image and view geometry on both sides');
        assert.equal(north.imageHref,
          `http://${ready.host}:${ready.port}/public/assets/kilnkeeper-battle-sprite.webp`);
        assert.equal(north.rasterCapture.imagePins.length, 1);
        assert.equal(north.rasterCapture.imagePins[0].sha256, imageSha256);
        assert.equal(north.rasterCapture.imagePins[0].byteLength, 47138);
        assert.deepEqual(north.rasterCapture.imagePins, south.rasterCapture.imagePins,
          'Kilnkeeper side color must not replace or alter its pinned body image');
        const expectedRings = [
          [north, '#C6452E', 'rgb(198, 69, 46)'],
          [south, '#2E7F86', 'rgb(46, 127, 134)'],
        ];
        for (const [sprite, stroke, computedStroke] of expectedRings) {
          assert.equal(sprite.vectorShapes.length, 1);
          const [ring] = sprite.vectorShapes;
          assert.equal(ring.tagName, 'ellipse');
          assert.deepEqual(ring.attributes, {
            'aria-hidden': 'true',
            cx: '256',
            cy: '486',
            fill: 'none',
            rx: '182',
            ry: '15',
            stroke,
            'stroke-width': '34',
          });
          assert.equal(ring.computedFill, 'none');
          assert.equal(ring.computedStroke, computedStroke);
          assert.equal(Number.parseFloat(ring.computedStrokeWidth), 34);
        }
        assert.deepEqual(north.vectorShapes[0].attributes, {
          ...south.vectorShapes[0].attributes,
          stroke: '#C6452E',
        }, 'Kilnkeeper only changes the ring team color between side variants');
        assert.equal(north.rasterCapture.alphaMaskSha256, south.rasterCapture.alphaMaskSha256,
          'Kilnkeeper team-color rings preserve the same visible alpha silhouette');
        continue;
      }
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
    assert.ok(result.art.every(a => a.kind === 'copperskiff' || a.kind === 'skymaul' ||
      a.kind === 'stormkite' ||
      (a.width >= 20 && a.width <= 55 && a.height >= 20)),
    'non-atlas body art keeps the original generic game-scale bounds');
    assert.ok(result.art.every(a => a.healthHeight === 4));
    assert.deepEqual(errors, []);
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
