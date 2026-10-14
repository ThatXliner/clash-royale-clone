import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { buildRelease } from "../scripts/build-release.js";
import { createEditableGameSessionSetup } from "../src/content/editable-deck.js";
import { combatEffectRootId } from "../src/sim/combat-effect-feed.js";
import { GameSession } from "../src/sim/game-session.js";

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS = process.env.CARDS019I_BROWSER_ARTIFACTS ??
  new URL("../artifacts/cards019i-round-1/builder/", import.meta.url).pathname;
const ARENA_MODULE = "src/ui/arena-shell-entry.js";
const DECK = Object.freeze([
  "coilblade", "mossguard", "copperskiff", "kilnkeeper",
  "brassbolt", "reedsting", "briar-band", "cinderlings",
]);
const BATTLE_ASSET_SHA256 = "43766c813461acbfe36a949c6a972ba4e5ddf07513276bd5079cf564b1bf157a";
const CONTEXTS = Object.freeze([
  { name: "phone-normal", reducedMotion: "no-preference", viewport: { height: 844, width: 390 } },
  { name: "phone-reduced", reducedMotion: "reduce", viewport: { height: 844, width: 390 } },
  { name: "desktop-normal", reducedMotion: "no-preference", viewport: { height: 933, width: 1_440 } },
  { name: "desktop-reduced", reducedMotion: "reduce", viewport: { height: 933, width: 1_440 } },
]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function audioContinuationFacts(value) {
  return {
    cursor: value.cursor,
    eventCount: value.eventCount,
    gainBasisPoints: value.gainBasisPoints,
    muted: value.muted,
    sessionTick: value.sessionTick,
    terminal: value.terminal,
  };
}

function browserSnapshotWithSession(bytes, sessionBytes) {
  const snapshot = JSON.parse(bytes);
  return { ...snapshot, session: sessionBytes };
}

async function serverAddress(stream) {
  let output = "";
  for await (const chunk of stream) {
    output += chunk;
    const newline = output.indexOf("\n");
    if (newline >= 0) return JSON.parse(output.slice(0, newline));
  }
  throw new Error("Cards019 browser server stopped before readiness");
}

async function settlePaint(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  await page.waitForTimeout(120);
}

async function settleBattleEntryVisual(page, frame) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await frame.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
  await frame.locator("body").screenshot({ animations: "disabled" });
  await frame.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await settlePaint(page);
}

async function clickWorldPoint(page, arena, x, y) {
  const box = await arena.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0,
    "the actual arena has a visible input surface");
  const metrics = await arena.evaluate((node) => ({
    borderLeft: node.clientLeft,
    borderTop: node.clientTop,
    clientHeight: node.clientHeight,
    clientWidth: node.clientWidth,
    rectHeight: node.getBoundingClientRect().height,
    rectWidth: node.getBoundingClientRect().width,
  }));
  const scaleX = box.width / metrics.rectWidth;
  const scaleY = box.height / metrics.rectHeight;
  const point = {
    x: box.x + (metrics.borderLeft + metrics.clientWidth * x / 18_000) * scaleX,
    y: box.y + (metrics.borderTop + metrics.clientHeight * (32_000 - y) / 32_000) * scaleY,
  };
  await page.mouse.click(point.x, point.y);
  return point;
}

async function installListenerGraphAudit(context) {
  await context.addInitScript(() => {
    const selector = '[data-ui="arena-shell"], [data-ui="arena"], ' +
      '[data-ui="audio-toggle"], [data-ui="restart"], [data-ui="card-slot"]';
    const listeners = new WeakMap();
    const targets = new Set();
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;
    const captureOf = (options) => typeof options === "boolean"
      ? options : options?.capture === true;
    const record = (target, type, listener, options, adding) => {
      if (!(target instanceof Element) || !target.matches(selector) ||
          captureOf(options) || listener === null) return;
      let byType = listeners.get(target);
      if (byType === undefined) {
        byType = new Map();
        listeners.set(target, byType);
        targets.add(target);
      }
      let values = byType.get(type);
      if (adding) {
        if (values === undefined) {
          values = new Set();
          byType.set(type, values);
        }
        values.add(listener);
      } else if (values !== undefined) {
        values.delete(listener);
        if (values.size === 0) byType.delete(type);
      }
    };
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      record(this, type, listener, options, true);
      return originalAdd.call(this, type, listener, options);
    };
    EventTarget.prototype.removeEventListener = function(type, listener, options) {
      record(this, type, listener, options, false);
      return originalRemove.call(this, type, listener, options);
    };
    const label = (node, slotIndex) => node.dataset.ui === "card-slot"
      ? `card-slot-${slotIndex}` : node.dataset.ui;
    const activeListeners = (node) => Array.from(listeners.get(node) ?? [],
      ([type, values]) => ({ count: values.size, type }))
      .filter(({ count }) => count > 0)
      .sort((left, right) => left.type.localeCompare(right.type));
    globalThis.__cards019ListenerGraph = () => {
      const shell = document.querySelector('[data-ui="arena-shell"]');
      if (shell === null) return null;
      const slots = Array.from(shell.querySelectorAll('[data-ui="card-slot"]'));
      const controls = Array.from(shell.querySelectorAll(
        '[data-ui="arena"], [data-ui="audio-toggle"], [data-ui="restart"]',
      ));
      const nodes = [shell, ...controls, ...slots];
      return {
        active: nodes.map((node) => ({
          listeners: activeListeners(node),
          target: label(node, slots.indexOf(node)),
        })),
        detachedWithListeners: Array.from(targets)
          .filter((node) => !node.isConnected && activeListeners(node).length > 0)
          .map((node) => ({ listeners: activeListeners(node), target: node.dataset.ui ?? "unknown" }))
          .sort((left, right) => left.target.localeCompare(right.target)),
      };
    };
  });
}

async function waitForCustomDeck(frame, moduleUrl, ids) {
  await frame.waitForFunction(async ({ entryUrl, expectedIds }) => {
    const { arenaHudController } = await import(entryUrl);
    return JSON.stringify(JSON.parse(arenaHudController.session.serialize()).setup.deck) ===
      JSON.stringify(expectedIds);
  }, { entryUrl: moduleUrl, expectedIds: ids }, { timeout: 10_000 });
}

async function captureFrame(frame, moduleUrl, sourceId = null, expectedRootId = null,
  targetUnitId = null) {
  return frame.evaluate(async ({ entryUrl, sourceUnitId, rootId, explicitTargetId }) => {
    const { arenaHudController } = await import(entryUrl);
    const controller = arenaHudController;
    const session = controller.session;
    const state = session.state;
    const layer = (name) => document.querySelector(
      `[data-game-browser-layer="${name}"]`,
    )?.innerHTML ?? null;
    const pointFromNode = (node) => {
      if (node === null) return null;
      const denominator = node.style.getPropertyValue("--effect-den");
      const invertedY = node.style.getPropertyValue("--effect-y-num");
      return {
        denominator,
        xNumerator: node.style.getPropertyValue("--effect-x-num"),
        yNumerator: String(BigInt(32_000) * BigInt(denominator) - BigInt(invertedY)),
      };
    };
    const marker = document.querySelector(
      '.combat-marker[data-kind="kilnkeeper"][data-side="south"]',
    );
    const svg = marker?.querySelector("svg.combat-art");
    const image = svg?.querySelector("image");
    const ring = svg?.querySelector("ellipse");
    let decodedImage = null;
    if (image !== null && image !== undefined) {
      const probe = new Image();
      probe.src = image.getAttribute("href");
      await probe.decode();
      decodedImage = { complete: probe.complete, height: probe.naturalHeight,
        width: probe.naturalWidth };
    }
    const source = sourceUnitId === null ? null :
      state.battle.units.find(({ id }) => id === sourceUnitId) ?? null;
    const projectile = sourceUnitId === null ? null :
      state.battle.projectiles.find(({ projectileIdentity }) =>
        projectileIdentity?.sourceId === sourceUnitId &&
        projectileIdentity.direction.startsWith("unit-to-")) ?? null;
    const observedTargetId = explicitTargetId ?? projectile?.targetId ?? null;
    const target = observedTargetId === null ? null :
      state.battle.units.find(({ id }) => id === observedTargetId) ?? null;
    const targetMarker = target === null ? null : Array.from(document.querySelectorAll(
      ".combat-marker[data-combat-id]",
    )).find((node) => node.dataset.combatId === String(target.id)) ?? null;
    const targetHealthBar = targetMarker?.querySelector(".combat-health") ?? null;
    const effectNode = rootId === null ? null : Array.from(document.querySelectorAll(
      ".combat-effect-projectile",
    )).find((node) => node.dataset.effectKey === rootId) ?? null;
    const splashAreas = Array.from(document.querySelectorAll(".combat-effect-area"), (node) => ({
      effectKey: node.dataset.effectKey,
      point: pointFromNode(node),
      radius: Number(node.style.getPropertyValue("--effect-radius")),
    }));
    const markerRect = marker?.getBoundingClientRect();
    return {
      audioBytes: controller.audioContinuationBytes,
      audioDiagnostics: controller.audioDiagnostics,
      audioPcmSequences: controller.audioScheduledPcm.map(({ sequence }) => sequence),
      browserBytes: controller.serialize(),
      combat: layer("combat"),
      combatBytes: layer("combat"),
      effects: layer("effects"),
      effectsBytes: layer("effects"),
      feedback: layer("feedback"),
      feedbackBytes: layer("feedback"),
      hud: layer("hud"),
      hudBytes: layer("hud"),
      marker: marker === null ? null : {
        artId: svg?.dataset.artId ?? null,
        bounds: markerRect === undefined ? null : [markerRect.x, markerRect.y,
          markerRect.width, markerRect.height],
        imageComplete: decodedImage?.complete ?? false,
        imageHref: image?.getAttribute("href") ?? null,
        imageHeight: decodedImage?.height ?? 0,
        imageWidth: decodedImage?.width ?? 0,
        layer: marker.dataset.layer ?? null,
        ringStroke: ring?.getAttribute("stroke") ?? null,
        side: marker.dataset.side ?? null,
      },
      projectile: projectile === null ? null : {
        impactTick: projectile.impactTick,
        identity: projectile.projectileIdentity,
        position: projectile.position,
        targetId: projectile.targetId,
      },
      projectileDom: effectNode === null ? null : {
        effectKey: effectNode.dataset.effectKey,
        kind: effectNode.dataset.kind,
        x: effectNode.style.getPropertyValue("--effect-x-num"),
        y: effectNode.style.getPropertyValue("--effect-y-num"),
        denominator: effectNode.style.getPropertyValue("--effect-den"),
        point: pointFromNode(effectNode),
      },
      splashAreas,
      replay: session.replay,
      replayLength: session.replay.length,
      sessionBytes: session.serialize(),
      sessionTick: state.tick,
      source: source === null ? null : {
        alive: source.alive,
        cardId: source.cardId,
        id: source.id,
        position: source.position,
        side: source.side,
      },
      target: target === null ? null : {
        alive: target.alive,
        cardId: target.cardId,
        id: target.id,
        hitpoints: target.hitpoints,
        maxHitpoints: target.maxHealth,
        position: target.position,
        side: target.side,
        displayedHealth: targetMarker === null ? null : {
          current: targetMarker.style.getPropertyValue("--combat-health"),
          maximum: targetMarker.style.getPropertyValue("--combat-health-max"),
          barCurrent: targetHealthBar === null ? null : getComputedStyle(targetHealthBar)
            .transform,
        },
      },
      tick: state.tick,
      viewProjectile: effectNode === null ? null : {
        key: effectNode.dataset.effectKey,
        kind: effectNode.dataset.kind,
        point: pointFromNode(effectNode),
      },
    };
  }, { entryUrl: moduleUrl, explicitTargetId: targetUnitId, sourceUnitId: sourceId,
    rootId: expectedRootId });
}

async function readInFlightEvidence(frame, moduleUrl, sourceId) {
  return frame.evaluate(async ({ entryUrl, sourceUnitId }) => {
    const { arenaHudController } = await import(entryUrl);
    const controller = arenaHudController;
    const session = controller.session;
    const source = session.state.battle.units.find(({ id, cardId, side }) =>
      id === sourceUnitId && cardId === "kilnkeeper" && side === "south");
    if (!source) throw new Error("south Kilnkeeper disappeared before its projectile");
    const launch = session.replay.find(({ type, projectileIdentity }) =>
      type === "projectile-launch" && projectileIdentity?.sourceId === sourceUnitId &&
      projectileIdentity.direction.startsWith("unit-to-"));
    if (!launch?.projectile || !launch.projectileIdentity) return null;
    const projectile = session.state.battle.projectiles.find(({ projectileIdentity }) =>
      JSON.stringify(projectileIdentity) === JSON.stringify(launch.projectileIdentity));
    if (!projectile) return null;
    return {
      launch: {
        impactTick: launch.projectile.impactTick,
        position: launch.projectile.position,
        targetId: launch.projectile.targetId,
        targetPosition: launch.projectile.targetPosition,
        tick: launch.tick,
      },
      projectile: {
        impactTick: projectile.impactTick,
        identity: projectile.projectileIdentity,
        position: projectile.position,
        targetId: projectile.targetId,
      },
      identity: launch.projectileIdentity,
      sessionTick: session.state.tick,
      sourceId: source.id,
      target: session.state.battle.units.find(({ id }) => id === projectile.targetId) ?? null,
    };
  }, { entryUrl: moduleUrl, sourceUnitId: sourceId });
}

test("Cards019I Kilnkeeper follows live projectiles in real browser battle and restores each motion mode", {
  timeout: 600_000,
}, async (t) => {
  assert.ok(existsSync(PLAYWRIGHT), "installed Playwright is required");
  assert.ok(existsSync(CHROME), "installed Chrome is required");
  await mkdir(ARTIFACTS, { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), "cards019-browser-release-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const releaseRoot = join(temporary, "artifact");
  await buildRelease({ output: releaseRoot });
  const manifestBytes = await readFile(join(releaseRoot, "release-manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const assetPath = join(releaseRoot, "public/assets/kilnkeeper-battle-sprite.webp");
  const assetBytes = await readFile(assetPath);
  assert.equal(sha256(assetBytes), BATTLE_ASSET_SHA256,
    "the real arena uses the already accepted Kilnkeeper battle cutout");
  assert.ok(manifest.files.some(({ path, sha256: digest }) =>
    path === "public/assets/kilnkeeper-battle-sprite.webp" &&
    digest === BATTLE_ASSET_SHA256), "the released battle cutout is integrity registered");

  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
    `--root=${releaseRoot}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => server.kill("SIGTERM"));
  const address = await serverAddress(server.stdout);
  const origin = `http://${address.host}:${address.port}`;
  const moduleUrl = new URL(`/${ARENA_MODULE}`, origin).href;
  const { chromium } = await import(PLAYWRIGHT);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  t.after(() => browser.close());
  const evidence = {
    asset: { bytes: assetBytes.byteLength, path: "public/assets/kilnkeeper-battle-sprite.webp",
      sha256: sha256(assetBytes) },
    contexts: [],
    deck: [...DECK],
    release: { fileCount: manifest.fileCount, manifestSha256: sha256(manifestBytes) },
  };

  for (const contextSpec of CONTEXTS) {
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      reducedMotion: contextSpec.reducedMotion,
      viewport: contextSpec.viewport,
    });
    t.after(() => context.close());
    await installListenerGraphAudit(context);
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(`pageerror: ${String(error)}`));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("requestfailed", (request) => errors.push(
      `requestfailed: ${request.url()} ${request.failure()?.errorText ?? "unknown"}`,
    ));

    const appResponse = await page.goto(`${origin}/public/index.html`, { waitUntil: "networkidle" });
    assert.equal(appResponse.status(), 200, contextSpec.name);
    await page.locator('.app-nav [data-nav-to="deck"]').click();
    await page.locator('[data-replace-slot="3"]').click();
    await page.locator('[data-replacement-card-id="kilnkeeper"]').click();
    const deckIds = await page.locator("[data-deck-cards] [data-card-id]").evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.cardId));
    assert.deepEqual(deckIds, DECK, `${contextSpec.name}: actual deck editor preserves eight ordered cards`);
    assert.equal(new Set(deckIds).size, 8, `${contextSpec.name}: the deck contains eight unique cards`);
    const expectedSetup = JSON.parse(createEditableGameSessionSetup(deckIds, 0));

    await page.locator('.app-nav [data-nav-to="battle"]').click();
    const frameLocator = page.frameLocator("[data-battle-frame-slot] iframe");
    const arenaLocator = frameLocator.locator('[data-ui="arena"]');
    await arenaLocator.waitFor({ state: "visible", timeout: 10_000 });
    const frame = page.frames().find((candidate) => candidate.url().includes("app-frame=1"));
    assert.ok(frame, `${contextSpec.name}: the released app mounted the actual battle frame`);
    await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      arenaHudController.enterManualStepMode();
    }, moduleUrl);
    const prefix = `kilnkeeper-${contextSpec.name}`;
    const entryScreenshot = `${prefix}-arena-entry.png`;

    await waitForCustomDeck(frame, moduleUrl, deckIds);
    await frame.evaluate(async ({ entryUrl, customDeck }) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      controller.pause();
      const alternateDeck = [...customDeck];
      alternateDeck[4] = "skymaul";
      controller.replaceDeck(alternateDeck);
      controller.replaceDeck(customDeck);
      controller.resume();
      controller.enterManualStepMode();
    }, { entryUrl: moduleUrl, customDeck: deckIds });
    await settleBattleEntryVisual(page, frame);
    await page.screenshot({ path: join(ARTIFACTS, entryScreenshot), fullPage: true,
      animations: "disabled" });
    const setupAndInitial = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      return {
        audio: { gainBasisPoints: controller.audio.gainBasisPoints,
          muted: controller.audio.muted },
        audioBytes: controller.audioContinuationBytes,
        audioDiagnostics: controller.audioDiagnostics,
        audioPcmEvents: controller.audioScheduledPcm.map(({ cueId, sequence, sourceType }) =>
          ({ cueId, sequence, sourceType })),
        audioPcmSequences: controller.audioScheduledPcm.map(({ sequence }) => sequence),
        browserBytes: controller.serialize(),
        hand: controller.session.state.decks.south.hand,
        legalNorthDeployments: JSON.parse(controller.session.serialize()).setup.legalNorthDeployments,
        listenerGraph: globalThis.__cards019ListenerGraph(),
        sequence: controller.session.state.decks.south.sequence,
        sessionBytes: controller.session.serialize(),
        sessionTick: controller.session.state.tick,
        setup: JSON.parse(controller.session.serialize()).setup,
      };
    }, moduleUrl);
    assert.deepEqual(setupAndInitial.setup, expectedSetup,
      `${contextSpec.name}: actual battle uses the canonical editable Kilnkeeper setup`);
    assert.equal(setupAndInitial.sessionTick, 0,
      `${contextSpec.name}: paused same-deck replacement establishes an actual tick-zero baseline`);
    const initialBrowserSnapshot = JSON.parse(setupAndInitial.browserBytes);
    assert.equal(initialBrowserSnapshot.session, setupAndInitial.sessionBytes,
      `${contextSpec.name}: initial browser state contains its exact session bytes`);
    const initialTranscript = JSON.parse(initialBrowserSnapshot.session).transcript;
    assert.deepEqual(initialTranscript, [{ type: "pause" }, { type: "resume" }],
      `${contextSpec.name}: initial setup uses the real paused deck replacement and resume path`);
    assert.equal(JSON.parse(setupAndInitial.audioBytes).sessionBytes, setupAndInitial.sessionBytes,
      `${contextSpec.name}: initial audio continuation embeds the canonical initial session`);
    assert.ok(setupAndInitial.hand.includes("kilnkeeper"),
      `${contextSpec.name}: the seed-zero player hand contains Kilnkeeper`);
    assert.ok(setupAndInitial.legalNorthDeployments.some(({ cardId }) => cardId === "kilnkeeper"),
      `${contextSpec.name}: the legal seeded opponent roster can select Kilnkeeper`);
    assert.deepEqual(setupAndInitial.audioPcmEvents, [],
      "fresh custom-deck setup has no scheduled audio cues");
    await settleBattleEntryVisual(page, frame);
    const initialBattlePixel = sha256(await page.screenshot({ animations: "disabled" }));

    await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      globalThis.__cards019Pointers = [];
      document.querySelector('[data-ui="arena"]').addEventListener("pointerup", (event) => {
        globalThis.__cards019Pointers.push({ isTrusted: event.isTrusted,
          clientX: event.clientX, clientY: event.clientY });
      }, true);
      arenaHudController.stepMany(61);
    }, moduleUrl);
    const opponentKilnkeeper = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      const session = arenaHudController.session;
      const deployment = session.replay.find(({ deployment: record, side, type }) =>
        type === "session-deployed" && side === "north" &&
        record?.cardId === "kilnkeeper");
      const unit = session.state.battle.units.find(({ cardId, side }) =>
        cardId === "kilnkeeper" && side === "north");
      return { deployment, unit };
    }, moduleUrl);
    assert.ok(opponentKilnkeeper.deployment,
      `${contextSpec.name}: seed-zero AI legally selects and deploys Kilnkeeper`);
    assert.equal(opponentKilnkeeper.deployment.spend.cost, 5);
    assert.ok(opponentKilnkeeper.unit,
      `${contextSpec.name}: the opponent Kilnkeeper is an actual shared battle entity`);

    const playerInitial = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      const state = arenaHudController.session.state;
      return { elixir: state.elixir.sides.south.amount,
        hand: state.decks.south.hand, sequence: state.decks.south.sequence,
        tick: state.tick };
    }, moduleUrl);
    const selectedKilnkeeper = frameLocator.locator(
      '[data-ui="card-slot"][data-card-id="kilnkeeper"]',
    );
    await selectedKilnkeeper.click();
    assert.equal(await frameLocator.locator(
      '[data-ui="hud-hand"] [data-card-id="kilnkeeper"]',
    ).getAttribute("data-selected"), "true",
      `${contextSpec.name}: the real hand selects Kilnkeeper`);
    const worldPoint = await clickWorldPoint(page, arenaLocator, 8_500, 14_500);
    const playerDeployment = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      controller.stepMany(1);
      const session = controller.session;
      const unit = session.state.battle.units.find(({ cardId, side }) =>
        cardId === "kilnkeeper" && side === "south");
      const deployment = session.replay.find(({ deployment: record, side, type }) =>
        type === "session-deployed" && side === "south" &&
        record?.cardId === "kilnkeeper");
      return {
        deployment,
        hand: session.state.decks.south.hand,
        pointers: globalThis.__cards019Pointers,
        sequence: session.state.decks.south.sequence,
        unit,
        elixir: session.state.elixir.sides.south.amount,
      };
    }, moduleUrl);
    assert.ok(playerDeployment.deployment,
      `${contextSpec.name}: the trusted gesture commits to the actual GameSession`);
    assert.equal(playerDeployment.deployment.spend.cost, 5);
    assert.ok(Math.abs(playerDeployment.deployment.deployment.point.x - 8_500) <= 1,
      `${contextSpec.name}: trusted pointer conversion stays within one millitile`);
    assert.ok(Math.abs(playerDeployment.deployment.deployment.point.y - 14_500) <= 1,
      `${contextSpec.name}: trusted pointer conversion stays within one millitile`);
    assert.equal(playerDeployment.sequence, playerInitial.sequence + 1,
      `${contextSpec.name}: one Kilnkeeper deployment advances the cycle once`);
    assert.equal(playerDeployment.elixir, playerInitial.elixir - 5,
      `${contextSpec.name}: the real player session spends exactly five elixir`);
    assert.ok(!playerDeployment.hand.includes("kilnkeeper"));
    assert.ok(playerDeployment.pointers.some(({ isTrusted }) => isTrusted),
      `${contextSpec.name}: deployment came from a trusted pointer event`);
    assert.ok(playerDeployment.unit,
      `${contextSpec.name}: the player Kilnkeeper is an actual shared battle entity`);

    await frame.waitForFunction(async ({ entryUrl, sourceId }) => {
      const { arenaHudController } = await import(entryUrl);
      return document.querySelector(
        '.combat-marker[data-kind="kilnkeeper"][data-side="south"]',
      ) !== null && arenaHudController.session.state.battle.units.some(({ id }) => id === sourceId);
    }, { entryUrl: moduleUrl, sourceId: playerDeployment.unit.id }, { timeout: 10_000 });
    await settlePaint(page);
    const deployed = await captureFrame(frame, moduleUrl, playerDeployment.unit.id);
    assert.ok(deployed.marker, `${contextSpec.name}: the real combat marker displays the cutout`);
    assert.equal(deployed.marker.artId, "kilnkeeper");
    assert.match(deployed.marker.imageHref, /kilnkeeper-battle-sprite\.webp/u);
    assert.equal(deployed.marker.imageComplete, true);
    assert.equal(deployed.marker.imageWidth, 512);
    assert.equal(deployed.marker.imageHeight, 512);
    assert.equal(deployed.marker.layer, "ground");
    assert.equal(deployed.marker.side, "south");
    assert.equal(deployed.marker.ringStroke, "#2E7F86");
    assert.ok(deployed.marker.bounds[2] >= 13 && deployed.marker.bounds[3] >= 13,
      `${contextSpec.name}: team-readable asset occupies its real arena marker: ${JSON.stringify(deployed.marker.bounds)}`);
    const markerScreenshot = `${prefix}-native-marker.png`;
    await frameLocator.locator(
      '.combat-marker[data-kind="kilnkeeper"][data-side="south"]',
    ).screenshot({ path: join(ARTIFACTS, markerScreenshot), animations: "disabled" });

    const southSourceId = playerDeployment.unit.id;
    let inFlight = null;
    let launchProbe = null;
    for (let step = 0; step < 1_000; step += 1) {
      await frame.evaluate(async (entryUrl) => {
        const { arenaHudController } = await import(entryUrl);
        arenaHudController.stepMany(1);
      }, moduleUrl);
      launchProbe = await readInFlightEvidence(frame, moduleUrl, southSourceId);
      if (launchProbe !== null) {
        launchProbe.rootId = combatEffectRootId({
          direction: launchProbe.identity.direction,
          effectId: null,
          projectileId: launchProbe.identity.projectileId,
          sequence: launchProbe.identity.attackSequence,
          sourceId: launchProbe.identity.sourceId,
          type: "projectile",
        });
        const observation = await captureFrame(frame, moduleUrl, southSourceId, launchProbe.rootId);
        if (observation.sessionTick > launchProbe.launch.impactTick + 1) {
          inFlight = { observation, probe: launchProbe };
          break;
        }
      }
    }
    assert.ok(inFlight,
      `${contextSpec.name}: the moving-target projectile remains live beyond its launch arrival estimate`);
    assert.ok(inFlight.probe.target,
      `${contextSpec.name}: the homing target is an actual live unit`);
    assert.equal(inFlight.probe.target.id, inFlight.probe.projectile.targetId);
    assert.notDeepEqual(inFlight.probe.target.position, inFlight.probe.launch.targetPosition,
      `${contextSpec.name}: the target moved after the projectile launched`);
    assert.deepEqual(inFlight.observation.projectile.identity,
      inFlight.probe.projectile.identity,
      `${contextSpec.name}: UI and shared battle preserve the complete typed projectile identity`);
    assert.deepEqual(inFlight.observation.viewProjectile.point,
      { denominator: "1", xNumerator: String(inFlight.probe.projectile.position.x),
        yNumerator: String(inFlight.probe.projectile.position.y) },
      `${contextSpec.name}: the projected point is the authoritative live position`);
    assert.equal(inFlight.observation.projectileDom.effectKey, inFlight.probe.rootId);
    assert.equal(inFlight.observation.projectileDom.x,
      String(inFlight.probe.projectile.position.x));
    assert.equal(inFlight.observation.projectileDom.y,
      String(32_000 - inFlight.probe.projectile.position.y));
    assert.equal(inFlight.observation.projectileDom.denominator, "1");
    const pendingScreenshot = `${prefix}-projectile-pursuit.png`;
    await page.screenshot({ path: join(ARTIFACTS, pendingScreenshot), fullPage: true,
      animations: "disabled" });

    const inFlightCheckpoint = inFlight.observation.browserBytes;
    const inFlightPixelBefore = sha256(await page.screenshot({ animations: "disabled" }));
    const contact = await frame.evaluate(async ({ entryUrl, sourceId, maxTicks }) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      const session = controller.session;
      const alreadyDamaged = session.replay.filter(({ attackerId, projectileIdentity, type }) =>
        type === "damage" && attackerId === sourceId &&
        projectileIdentity?.sourceId === sourceId).length;
      const events = [];
      let ticks = 0;
      let damage = null;
      while (ticks < maxTicks) {
        events.push(...controller.stepMany(1));
        ticks += 1;
        const hits = controller.session.replay.filter(({ attackerId, projectileIdentity, type }) =>
          type === "damage" && attackerId === sourceId &&
          projectileIdentity?.sourceId === sourceId);
        if (hits.length > alreadyDamaged) {
          damage = hits[alreadyDamaged];
          break;
        }
      }
      const impactSession = controller.session;
      const snapshot = impactSession.projectionSnapshot();
      const identity = damage?.projectileIdentity ?? null;
      const sameIdentity = (candidate) => candidate !== null && candidate !== undefined &&
        candidate.direction === identity?.direction &&
        candidate.sourceId === identity?.sourceId &&
        candidate.attackSequence === identity?.attackSequence &&
        candidate.projectileId === identity?.projectileId;
      const launch = identity === null ? null : impactSession.replay.find((event) =>
        event.type === "projectile-launch" && sameIdentity(event.projectileIdentity)) ?? null;
      const impact = identity === null ? null : impactSession.replay.find((event) =>
        event.type === "projectile-impact" && sameIdentity(event.projectileIdentity)) ?? null;
      const root = identity === null ? null : snapshot.combatEffectFeed.records.find((record) =>
        record.phase === "open" && record.payload.direction === identity.direction &&
        record.payload.sourceId === identity.sourceId &&
        record.payload.sequence === identity.attackSequence &&
        record.payload.projectileId === identity.projectileId) ?? null;
      const contact = root === null ? null : snapshot.combatEffectFeed.records.find((record) =>
        record.rootId === root.rootId && record.phase === "contact" &&
        record.payload.status === "contact" && record.payload.targetId === damage?.targetId) ?? null;
      return {
        audioBytes: controller.audioContinuationBytes,
        audioDiagnostics: controller.audioDiagnostics,
        audioPcmSequences: controller.audioScheduledPcm.map(({ sequence }) => sequence),
        browserBytes: controller.serialize(),
        damage,
        events,
        hitCount: controller.session.replay.filter(({ attackerId, projectileIdentity, type }) =>
          type === "damage" && attackerId === sourceId &&
          projectileIdentity?.sourceId === sourceId).length,
        splash: {
          center: contact?.payload.point ?? null,
          contactTick: contact?.tick ?? null,
          identity,
          impactStatus: impact?.status ?? null,
          launchIdentity: launch?.projectileIdentity ?? null,
          radius: launch?.projectile?.splashProfile?.radiusMillitiles ?? null,
          rootId: root?.rootId ?? null,
        },
        replayLength: controller.session.replay.length,
        sessionBytes: controller.session.serialize(),
        sessionTick: controller.session.state.tick,
        ticks,
      };
    }, { entryUrl: moduleUrl, sourceId: southSourceId, maxTicks: 120 });
    assert.ok(contact.damage,
      `${contextSpec.name}: the pursuing projectile reaches a real damage contact`);
    assert.equal(contact.damage.amount, 281);
    assert.ok(contact.ticks > 0 && contact.ticks < 120);
    assert.equal(contact.hitCount, 1,
      `${contextSpec.name}: the live projectile resolves exactly one primary damage event`);
    assert.ok(contact.sessionTick > inFlight.probe.launch.impactTick,
      `${contextSpec.name}: contact occurs after the original planned arrival boundary`);

    await settlePaint(page);
    const contactRootId = combatEffectRootId({
      direction: contact.damage.projectileIdentity.direction,
      effectId: null,
      projectileId: contact.damage.projectileIdentity.projectileId,
      sequence: contact.damage.projectileIdentity.attackSequence,
      sourceId: contact.damage.projectileIdentity.sourceId,
      type: "projectile",
    });
    assert.equal(contactRootId, inFlight.probe.rootId,
    `${contextSpec.name}: the damage event preserves the full visual identity`);
    assert.equal(contact.splash.impactStatus, "contact",
      `${contextSpec.name}: the canonical projectile impact is a damaging contact`);
    assert.deepEqual(contact.splash.launchIdentity, contact.splash.identity,
      `${contextSpec.name}: the area ring is joined to the exact typed launch`);
    assert.equal(contact.splash.rootId, contactRootId,
      `${contextSpec.name}: the contact center is joined through its full effect root`);
    assert.equal(contact.splash.contactTick, contact.damage.tick,
      `${contextSpec.name}: ring timing follows the impact event boundary`);
    assert.ok(Number.isSafeInteger(contact.splash.radius) && contact.splash.radius > 0,
      `${contextSpec.name}: the launched canonical profile supplies the ring radius`);
    assert.ok(contact.splash.center,
      `${contextSpec.name}: the visible splash uses the canonical feed impact center`);
    const contactView = await captureFrame(frame, moduleUrl, southSourceId, null,
      contact.damage.targetId);
    const visibleSplash = contactView.splashAreas.filter(({ effectKey }) =>
      effectKey.startsWith(`${contactRootId}:splash:`));
    assert.equal(visibleSplash.length, 1,
      `${contextSpec.name}: one real splash contact produces one visible arena burst`);
    assert.deepEqual(visibleSplash[0].point, contact.splash.center,
      `${contextSpec.name}: the ring is centered on the exact feed contact point`);
    assert.equal(visibleSplash[0].radius, contact.splash.radius,
      `${contextSpec.name}: the ring radius comes from the canonical launch profile`);
    assert.equal(contactView.target?.id, contact.damage.targetId,
      `${contextSpec.name}: actual damaged target remains in the shared arena projection`);
    assert.equal(contactView.target.hitpoints, contact.damage.currentHealthAfter);
    assert.equal(contactView.target.displayedHealth.current,
      String(contact.damage.currentHealthAfter),
    `${contextSpec.name}: the rendered target health bar follows the real impact`);
    const damagedScreenshot = `${prefix}-splash-contact.png`;
    await settleBattleEntryVisual(page, frame);
    await page.screenshot({ path: join(ARTIFACTS, damagedScreenshot), fullPage: true,
      animations: "disabled" });
    const contactPixelBefore = sha256(await page.screenshot({ animations: "disabled" }));

    const inFlightRestore = await frame.evaluate(async ({ entryUrl, checkpointBytes, sourceId, ticks }) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      controller.restore(checkpointBytes);
      const atRestore = {
        audioBytes: controller.audioContinuationBytes,
        audioDiagnostics: controller.audioDiagnostics,
        audioPcmSequences: controller.audioScheduledPcm.map(({ sequence }) => sequence),
        browserBytes: controller.serialize(),
        replayLength: controller.session.replay.length,
        sessionBytes: controller.session.serialize(),
      };
      const replayed = [];
      for (let index = 0; index < ticks; index += 1) replayed.push(...controller.stepMany(1));
      return {
        atRestore,
        audioBytes: controller.audioContinuationBytes,
        audioDiagnostics: controller.audioDiagnostics,
        audioPcmSequences: controller.audioScheduledPcm.map(({ sequence }) => sequence),
        browserBytes: controller.serialize(),
        replayed,
        replayLength: controller.session.replay.length,
        sessionBytes: controller.session.serialize(),
        sourceId,
      };
    }, { entryUrl: moduleUrl, checkpointBytes: inFlightCheckpoint,
      sourceId: southSourceId, ticks: contact.ticks });
    assert.equal(inFlightRestore.atRestore.browserBytes, inFlightCheckpoint,
      `${contextSpec.name}: pending-projectile browser restore is byte exact`);
    assert.equal(inFlightRestore.atRestore.sessionBytes, inFlight.observation.sessionBytes);
    assert.equal(inFlightRestore.atRestore.audioBytes, inFlight.observation.audioBytes);
    assert.deepEqual(inFlightRestore.atRestore.audioPcmSequences, contact.audioPcmSequences,
      `${contextSpec.name}: restore preserves already-scheduled PCM without replaying it`);
    assert.deepEqual(inFlightRestore.replayed, contact.events,
      `${contextSpec.name}: restored target pursuit emits the same contacts and events`);
    assert.equal(inFlightRestore.sessionBytes, contact.sessionBytes);
    assert.equal(inFlightRestore.browserBytes, contact.browserBytes);
    assert.equal(inFlightRestore.audioBytes, contact.audioBytes);
    assert.equal(inFlightRestore.audioDiagnostics.cursor, contact.audioDiagnostics.cursor);
    assert.equal(inFlightRestore.audioDiagnostics.eventCount, contact.audioDiagnostics.eventCount);
    assert.equal(inFlightRestore.audioDiagnostics.sessionTick, contact.audioDiagnostics.sessionTick);
    const resumedPcmTail = contact.audioPcmSequences.slice(
      inFlight.observation.audioPcmSequences.length,
    );
    assert.deepEqual(inFlightRestore.audioPcmSequences,
      [...contact.audioPcmSequences, ...resumedPcmTail],
    `${contextSpec.name}: replay schedules only the exact post-checkpoint PCM suffix once`);
    await settleBattleEntryVisual(page, frame);
    const restoredContact = await captureFrame(frame, moduleUrl, southSourceId, null,
      contact.damage.targetId);
    assert.equal(sha256(await page.screenshot({ animations: "disabled" })), contactPixelBefore,
      `${contextSpec.name}: restored splash contact is pixel-identical in the same motion mode`);
    assert.equal(restoredContact.effectsBytes, contactView.effectsBytes);
    assert.equal(restoredContact.combat, contactView.combat);

    const contactCheckpoint = contact.browserBytes;
    const contactRestore = await frame.evaluate(async ({ entryUrl, checkpointBytes }) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      const expectedNextEvents = controller.stepMany(1);
      const expectedNext = {
        audioBytes: controller.audioContinuationBytes,
        audioDiagnostics: controller.audioDiagnostics,
        audioPcmSequences: controller.audioScheduledPcm.map(({ sequence }) => sequence),
        browserBytes: controller.serialize(),
        sessionBytes: controller.session.serialize(),
      };
      controller.restore(checkpointBytes);
      const exact = {
        audioBytes: controller.audioContinuationBytes,
        audioDiagnostics: controller.audioDiagnostics,
        audioPcmSequences: controller.audioScheduledPcm.map(({ sequence }) => sequence),
        browserBytes: controller.serialize(),
        sessionBytes: controller.session.serialize(),
      };
      const replayed = controller.stepMany(1);
      return {
        audioBytes: controller.audioContinuationBytes,
        audioDiagnostics: controller.audioDiagnostics,
        audioPcmSequences: controller.audioScheduledPcm.map(({ sequence }) => sequence),
        browserBytes: controller.serialize(),
        exact,
        expectedNext,
        expectedNextEvents,
        replayed,
        sessionBytes: controller.session.serialize(),
      };
    }, { entryUrl: moduleUrl, checkpointBytes: contactCheckpoint });
    assert.equal(contactRestore.exact.browserBytes, contactCheckpoint,
      `${contextSpec.name}: damaged-session checkpoint restores byte exactly`);
    assert.equal(contactRestore.exact.sessionBytes, contactView.sessionBytes);
    assert.equal(contactRestore.exact.audioBytes, contactView.audioBytes);
    assert.deepEqual(contactRestore.exact.audioPcmSequences,
      contactRestore.expectedNext.audioPcmSequences,
      `${contextSpec.name}: damaged restore preserves the sink's already-scheduled PCM log`);
    assert.deepEqual(contactRestore.replayed, contactRestore.expectedNextEvents);
    assert.equal(contactRestore.sessionBytes, contactRestore.expectedNext.sessionBytes);
    assert.equal(contactRestore.browserBytes, contactRestore.expectedNext.browserBytes);
    assert.equal(contactRestore.audioBytes, contactRestore.expectedNext.audioBytes);
    assert.equal(contactRestore.audioDiagnostics.cursor,
      contactRestore.expectedNext.audioDiagnostics.cursor);
    assert.equal(contactRestore.audioDiagnostics.eventCount,
      contactRestore.expectedNext.audioDiagnostics.eventCount);
    assert.deepEqual(contactRestore.audioPcmSequences,
      contactRestore.expectedNext.audioPcmSequences,
      `${contextSpec.name}: one restored post-damage tick produces the same PCM continuation`);

    const terminal = await frame.evaluate(async ({ entryUrl, maxTicks }) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      const events = controller.stepMany(maxTicks);
      const setup = JSON.parse(controller.session.serialize()).setup;
      return {
        audio: { gainBasisPoints: controller.audio.gainBasisPoints,
          muted: controller.audio.muted },
        audioBytes: controller.audioContinuationBytes,
        audioDiagnostics: controller.audioDiagnostics,
        audioPcmSequences: controller.audioScheduledPcm.map(({ sequence }) => sequence),
        browserBytes: controller.serialize(),
        eventCount: events.length,
        listenerGraph: globalThis.__cards019ListenerGraph(),
        replayLength: controller.session.replay.length,
        seed: setup.seed,
        sessionBytes: controller.session.serialize(),
        setup,
        tick: controller.session.state.tick,
        terminal: controller.session.state.terminal,
      };
    }, { entryUrl: moduleUrl, maxTicks: 8_000 });
    assert.equal(terminal.terminal, true,
      `${contextSpec.name}: the restored custom-deck match reaches its real terminal state by tick ${terminal.tick}`);
    assert.ok(terminal.tick > contact.sessionTick && terminal.tick <= 9_000,
      `${contextSpec.name}: terminal continuation remains bounded below the match cap`);
    assert.equal(terminal.seed, 0);
    assert.deepEqual(terminal.setup.deck, DECK,
      `${contextSpec.name}: terminal snapshot retains the edited eight-card deck`);
    assert.ok(terminal.eventCount > 0 && terminal.replayLength > contactRestore.replayed.length);

    const terminalRestore = await frame.evaluate(async ({ entryUrl, bytes }) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      controller.restore(bytes);
      return {
        audio: { gainBasisPoints: controller.audio.gainBasisPoints,
          muted: controller.audio.muted },
        audioBytes: controller.audioContinuationBytes,
        audioDiagnostics: controller.audioDiagnostics,
        audioPcmSequences: controller.audioScheduledPcm.map(({ sequence }) => sequence),
        browserBytes: controller.serialize(),
        listenerGraph: globalThis.__cards019ListenerGraph(),
        replayLength: controller.session.replay.length,
        sessionBytes: controller.session.serialize(),
        tick: controller.session.state.tick,
        terminal: controller.session.state.terminal,
        restartVisible: !document.querySelector('[data-ui="restart"]').hidden,
      };
    }, { entryUrl: moduleUrl, bytes: terminal.browserBytes });
    assert.equal(terminalRestore.browserBytes, terminal.browserBytes,
      `${contextSpec.name}: terminal browser restore is byte exact`);
    assert.equal(terminalRestore.sessionBytes, terminal.sessionBytes);
    assert.equal(terminalRestore.audioBytes, terminal.audioBytes);
    assert.deepEqual(audioContinuationFacts(terminalRestore.audioDiagnostics),
      audioContinuationFacts(terminal.audioDiagnostics));
    assert.deepEqual(terminalRestore.audioPcmSequences, terminal.audioPcmSequences);
    assert.equal(terminalRestore.replayLength, terminal.replayLength);
    assert.equal(terminalRestore.tick, terminal.tick);
    assert.equal(terminalRestore.terminal, true);
    assert.equal(terminalRestore.restartVisible, true,
      `${contextSpec.name}: restored terminal session exposes its restart control`);
    assert.deepEqual(terminalRestore.listenerGraph.detachedWithListeners, []);

    const restartButton = frameLocator.locator('[data-ui="restart"]');
    await restartButton.waitFor({ state: "visible", timeout: 10_000 });
    await restartButton.click();
    await frame.waitForFunction(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      return arenaHudController.state.restartCount === 1 &&
        arenaHudController.session.state.tick === 0;
    }, moduleUrl, { timeout: 10_000 });
    await settlePaint(page);
    const restartEvidence = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      const setup = JSON.parse(controller.session.serialize()).setup;
      const state = controller.session.state;
      return {
        audio: { gainBasisPoints: controller.audio.gainBasisPoints,
          muted: controller.audio.muted },
        audioBytes: controller.audioContinuationBytes,
        audioDiagnostics: controller.audioDiagnostics,
        audioPcmEvents: controller.audioScheduledPcm.map(({ cueId, sequence, sourceType }) =>
          ({ cueId, sequence, sourceType })),
        audioPcmSequences: controller.audioScheduledPcm.map(({ sequence }) => sequence),
        browserBytes: controller.serialize(),
        deck: setup.deck,
        hand: state.decks.south.hand,
        elixir: state.elixir.sides.south.amount,
        listenerGraph: globalThis.__cards019ListenerGraph(),
        replayLength: controller.session.replay.length,
        restartCount: controller.state.restartCount,
        seed: setup.seed,
        sequence: state.decks.south.sequence,
        sessionBytes: controller.session.serialize(),
        sessionTick: state.tick,
        setup,
      };
    }, moduleUrl);
    const expectedRestartSessionBytes = new GameSession(
      createEditableGameSessionSetup(deckIds, 0),
    ).serialize();
    assert.equal(restartEvidence.restartCount, 1,
      `${contextSpec.name}: restored terminal match is replaced exactly once`);
    assert.deepEqual(restartEvidence.deck, DECK,
      `${contextSpec.name}: restart retains the same custom deck`);
    assert.equal(restartEvidence.seed, 0);
    assert.equal(restartEvidence.sessionTick, 0);
    assert.equal(restartEvidence.sequence, 0);
    assert.equal(restartEvidence.replayLength, 0,
      `${contextSpec.name}: restart clears the terminal event history`);
    assert.equal(restartEvidence.sessionBytes, expectedRestartSessionBytes,
      `${contextSpec.name}: restart recreates the exact seed-zero custom session`);
    assert.deepEqual(restartEvidence.setup, expectedSetup);
    const restartedBrowserSnapshot = JSON.parse(restartEvidence.browserBytes);
    assert.deepEqual(JSON.parse(expectedRestartSessionBytes).transcript, [],
      `${contextSpec.name}: a restarted session has a fresh event transcript`);
    assert.deepEqual(restartedBrowserSnapshot,
      browserSnapshotWithSession(setupAndInitial.browserBytes, expectedRestartSessionBytes),
      `${contextSpec.name}: restart preserves the exact browser envelope around its fresh session`);
    assert.equal(restartedBrowserSnapshot.session, expectedRestartSessionBytes,
      `${contextSpec.name}: restarted browser snapshot carries the fresh session bytes`);
    const restartedAudioContinuation = JSON.parse(restartEvidence.audioBytes);
    const expectedRestartAudioContinuation = {
      ...JSON.parse(setupAndInitial.audioBytes),
      sessionBytes: expectedRestartSessionBytes,
    };
    assert.deepEqual(restartedAudioContinuation, expectedRestartAudioContinuation,
      `${contextSpec.name}: restart preserves the exact initial audio continuation around its fresh session`);
    assert.deepEqual(audioContinuationFacts(setupAndInitial.audioDiagnostics), {
      cursor: 0,
      eventCount: 0,
      gainBasisPoints: setupAndInitial.audio.gainBasisPoints,
      muted: setupAndInitial.audio.muted,
      sessionTick: 0,
      terminal: false,
    }, `${contextSpec.name}: the initial tick-zero session has an empty audio continuation`);
    assert.deepEqual(audioContinuationFacts(restartEvidence.audioDiagnostics),
      audioContinuationFacts(setupAndInitial.audioDiagnostics),
      `${contextSpec.name}: restart preserves the exact initial audio continuation diagnostics`);
    assert.deepEqual(restartEvidence.audioPcmSequences, setupAndInitial.audioPcmSequences);
    assert.deepEqual(restartEvidence.audioPcmEvents, setupAndInitial.audioPcmEvents,
      "restart begins with the same zero scheduled PCM state");
    assert.deepEqual(restartEvidence.audio, setupAndInitial.audio,
      `${contextSpec.name}: restart preserves the initial audio policy exactly`);
    assert.deepEqual(restartEvidence.listenerGraph, setupAndInitial.listenerGraph,
      `${contextSpec.name}: restart restores one clean input/audio listener graph`);
    assert.deepEqual(restartEvidence.listenerGraph.detachedWithListeners, []);
    await settleBattleEntryVisual(page, frame);
    const restartScreenshot = `${prefix}-terminal-restart-entry.png`;
    await page.screenshot({ path: join(ARTIFACTS, restartScreenshot), fullPage: true,
      animations: "disabled" });
    const restartEntryPixel = sha256(await page.screenshot({ animations: "disabled" }));
    assert.equal(restartEntryPixel, initialBattlePixel,
      `${contextSpec.name}: terminal restart renders pixels identical to the same-deck entry`);

    await frameLocator.locator('[data-ui="audio-toggle"]').click();
    const toggledAudio = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      return { audio: { gainBasisPoints: controller.audio.gainBasisPoints,
        muted: controller.audio.muted },
        audioPcmEvents: controller.audioScheduledPcm.map(({ cueId, sequence, sourceType }) =>
          ({ cueId, sequence, sourceType })),
        audioPcmSequences: controller.audioScheduledPcm.map(({ sequence }) => sequence),
        listenerGraph: globalThis.__cards019ListenerGraph() };
    }, moduleUrl);
    assert.equal(toggledAudio.audio.muted, !restartEvidence.audio.muted,
      `${contextSpec.name}: one trusted sound-toggle click changes audio policy once`);
    assert.deepEqual(toggledAudio.audioPcmSequences,
      [...restartEvidence.audioPcmSequences, restartEvidence.audioPcmSequences.length],
      `${contextSpec.name}: first sound toggle schedules exactly one UI cue`);
    assert.deepEqual(toggledAudio.audioPcmEvents,
      [...restartEvidence.audioPcmEvents,
        { cueId: "ui-toggle", sequence: 0, sourceType: "ui-toggle" }],
      `${contextSpec.name}: first sound toggle schedules one canonical UI cue`);
    assert.deepEqual(toggledAudio.listenerGraph, restartEvidence.listenerGraph);
    await frameLocator.locator('[data-ui="audio-toggle"]').click();
    const restoredAudioPolicy = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      return {
        audio: { gainBasisPoints: controller.audio.gainBasisPoints,
          muted: controller.audio.muted },
        audioBytes: controller.audioContinuationBytes,
        audioPcmEvents: controller.audioScheduledPcm.map(({ cueId, sequence, sourceType }) =>
          ({ cueId, sequence, sourceType })),
        audioPcmSequences: controller.audioScheduledPcm.map(({ sequence }) => sequence),
        listenerGraph: globalThis.__cards019ListenerGraph(),
      };
    }, moduleUrl);
    assert.deepEqual(restoredAudioPolicy.audio, restartEvidence.audio);
    assert.equal(restoredAudioPolicy.audioBytes, restartEvidence.audioBytes);
    assert.deepEqual(restoredAudioPolicy.audioPcmSequences,
      [...restartEvidence.audioPcmSequences, restartEvidence.audioPcmSequences.length,
        restartEvidence.audioPcmSequences.length + 1],
      `${contextSpec.name}: second sound toggle schedules one additional UI cue`);
    assert.deepEqual(restoredAudioPolicy.audioPcmEvents,
      [...restartEvidence.audioPcmEvents,
        { cueId: "ui-toggle", sequence: 0, sourceType: "ui-toggle" },
        { cueId: "ui-toggle", sequence: 1, sourceType: "ui-toggle" }],
      `${contextSpec.name}: two sound toggles schedule exactly the canonical UI cue stream`);
    assert.deepEqual(restoredAudioPolicy.listenerGraph, restartEvidence.listenerGraph);

    await frame.evaluate(() => {
      globalThis.__cards019RestartPointers = [];
      document.querySelector('[data-ui="arena"]').addEventListener("pointerup", (event) => {
        globalThis.__cards019RestartPointers.push({ isTrusted: event.isTrusted,
          clientX: event.clientX, clientY: event.clientY });
      }, true);
    });
    const restartHandCard = frameLocator.locator(
      '[data-ui="card-slot"][data-card-id="kilnkeeper"]',
    );
    await restartHandCard.waitFor({ state: "visible", timeout: 10_000 });
    await restartHandCard.click();
    const restartWorldPoint = await clickWorldPoint(page, arenaLocator, 8_500, 14_500);
    const firstRestartDeployment = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      const events = controller.stepMany(1);
      const sessionDeployments = events.filter(({ type }) => type === "session-deployed");
      const sessionDeployment = sessionDeployments.find(({ side }) => side === "south") ?? null;
      const session = controller.session;
      const deployments = session.replay.filter(({ side, type }) =>
        type === "session-deployed" && side === "south");
      const state = session.state;
      return {
        audioBytes: controller.audioContinuationBytes,
        audioDiagnostics: controller.audioDiagnostics,
        audioPcmEvents: controller.audioScheduledPcm.map(({ cueId, sequence, sourceType }) =>
          ({ cueId, sequence, sourceType })),
        audioPcmSequences: controller.audioScheduledPcm.map(({ sequence }) => sequence),
        cycleSequence: state.decks.south.sequence,
        deployment: deployments[0] ?? null,
        deploymentCount: deployments.length,
        events,
        hand: state.decks.south.hand,
        listenerGraph: globalThis.__cards019ListenerGraph(),
        pointers: globalThis.__cards019RestartPointers,
        replayLength: session.replay.length,
        sessionDeployment,
        sessionDeployments,
        sessionBytes: session.serialize(),
        unit: state.battle.units.find(({ cardId, side }) =>
          cardId === "kilnkeeper" && side === "south") ?? null,
        elixir: state.elixir.sides.south.amount,
      };
    }, moduleUrl);
    assert.ok(firstRestartDeployment.deployment,
      `${contextSpec.name}: restarted custom deck accepts its first real deployment`);
    assert.equal(firstRestartDeployment.deployment.spend.cost, 5);
    assert.ok(Math.abs(firstRestartDeployment.deployment.deployment.point.x - 8_500) <= 1);
    assert.ok(Math.abs(firstRestartDeployment.deployment.deployment.point.y - 14_500) <= 1);
    assert.equal(firstRestartDeployment.deploymentCount, 1,
      `${contextSpec.name}: one trusted deploy yields one player event`);
    assert.equal(firstRestartDeployment.sessionDeployments.filter(({ side }) =>
      side === "south").length, 1, "one fresh player deployment reaches the simulation audio stream");
    assert.ok(firstRestartDeployment.sessionDeployment);
    assert.equal(firstRestartDeployment.sessionDeployment.deployment.cardId, "kilnkeeper");
    assert.equal(firstRestartDeployment.sessionDeployment.side, "south");
    assert.deepEqual(firstRestartDeployment.sessionDeployment.deployment.entityIds,
      [firstRestartDeployment.unit.id],
      "the one simulation deployment cue resolves to the restarted Kilnkeeper entity ID");
    const simulationDeploySequences = firstRestartDeployment.sessionDeployments.map(
      ({ deployment }) => deployment.sequence);
    assert.equal(new Set(simulationDeploySequences).size, simulationDeploySequences.length,
      "each actual player or AI deployment has one distinct simulation sequence");
    assert.deepEqual(firstRestartDeployment.audioPcmEvents.filter(({ cueId }) =>
      cueId === "field-deploy"),
    firstRestartDeployment.sessionDeployments.map(({ deployment }) => ({
      cueId: "field-deploy", sequence: deployment.sequence, sourceType: "deployed",
    })),
    "the restarted session emits one simulation deploy cue per actual deployed entity");
    assert.equal(firstRestartDeployment.cycleSequence, 1,
      `${contextSpec.name}: the first restarted deploy advances the cycle once`);
    assert.equal(firstRestartDeployment.elixir, restartEvidence.elixir - 5,
      `${contextSpec.name}: the first restarted deploy spends five elixir once`);
    assert.ok(!firstRestartDeployment.hand.includes("kilnkeeper"));
    assert.ok(firstRestartDeployment.unit);
    assert.ok(firstRestartDeployment.pointers.some(({ isTrusted }) => isTrusted),
      `${contextSpec.name}: the restarted deploy came from a trusted pointer gesture`);
    assert.deepEqual(firstRestartDeployment.listenerGraph, restartEvidence.listenerGraph,
      `${contextSpec.name}: deploy remounts no duplicate input listeners`);
    assert.deepEqual(firstRestartDeployment.audioPcmEvents.slice(0,
      restoredAudioPolicy.audioPcmEvents.length), restoredAudioPolicy.audioPcmEvents,
    `${contextSpec.name}: restart and deploy do not replay scheduled audio cues`);
    const audioEventKeys = firstRestartDeployment.audioPcmEvents.map(({ sequence, sourceType }) =>
      `${sourceType}:${sequence}`);
    assert.equal(new Set(audioEventKeys).size, audioEventKeys.length,
      `${contextSpec.name}: scheduled audio event identities are unique within each source stream`);
    assert.deepEqual(errors, [], `${contextSpec.name}: browser console, page, and network are clean`);
    evidence.contexts.push({
      contact: {
        damage: contact.damage,
        tick: contact.sessionTick,
        ticksFromPendingRestore: contact.ticks,
        damagedTarget: contactView.target,
      },
      deck: deckIds,
      errors,
      inFlight: {
        identity: inFlight.probe.projectile.identity,
        launchTick: inFlight.probe.launch.tick,
        launchPlannedImpactTick: inFlight.probe.launch.impactTick,
        pendingTick: inFlight.observation.sessionTick,
        pendingPosition: inFlight.probe.projectile.position,
        rootId: inFlight.probe.rootId,
        targetAtLaunch: inFlight.probe.launch.targetPosition,
        targetAtPending: inFlight.probe.target.position,
        targetId: inFlight.probe.projectile.targetId,
        viewPoint: inFlight.observation.viewProjectile.point,
      },
      motionPreference: contextSpec.reducedMotion,
      pixels: {
        contactRestoreSha256: contactPixelBefore,
        inFlightRestoreSha256: inFlightPixelBefore,
        initialBattleSha256: initialBattlePixel,
        terminalRestartSha256: restartEntryPixel,
      },
      restart: {
        audioPolicy: restartEvidence.audio,
        audioSessionSha256: sha256(restartEvidence.sessionBytes),
        audioContinuationStateMatchesInitial: true,
        browserBytesResetToInitial: restartEvidence.browserBytes === setupAndInitial.browserBytes,
        deck: restartEvidence.deck,
        detachedListeners: restartEvidence.listenerGraph.detachedWithListeners,
        firstValidDeployment: {
          cost: firstRestartDeployment.deployment.spend.cost,
          cycleSequence: firstRestartDeployment.cycleSequence,
          deploymentCount: firstRestartDeployment.deploymentCount,
          elixirAfter: firstRestartDeployment.elixir,
          eventCount: firstRestartDeployment.events.length,
          trustedPointer: firstRestartDeployment.pointers.some(({ isTrusted }) => isTrusted),
        },
        listenerGraph: restartEvidence.listenerGraph.active,
        replayLength: restartEvidence.replayLength,
        restartCount: restartEvidence.restartCount,
        sessionTick: restartEvidence.sessionTick,
        terminal: {
          browserSha256: sha256(terminal.browserBytes),
          eventCount: terminal.eventCount,
          replayLength: terminal.replayLength,
          restoredByteExact: terminalRestore.browserBytes === terminal.browserBytes,
          sessionSha256: sha256(terminal.sessionBytes),
          tick: terminal.tick,
        },
        terminalRestartScreenshot: restartScreenshot,
      },
      screenshots: [entryScreenshot, markerScreenshot, pendingScreenshot, damagedScreenshot,
        restartScreenshot],
      viewport: contextSpec.viewport,
      trustedPlayerDeploy: {
        point: { x: 8_500, y: 14_500 },
        screenPoint: worldPoint,
        spend: playerDeployment.deployment.spend,
        cycleSequence: playerDeployment.sequence,
        markerBounds: deployed.marker.bounds,
      },
    });
    await context.close();
  }

  await writeFile(join(ARTIFACTS, "cards019-browser-integration-evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`);
});
