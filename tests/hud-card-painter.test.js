import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";
import { EDITABLE_MIXED_DECK_CARD_IDS } from "../src/content/editable-deck.js";
import {
  EDITABLE_DECK_CARD_IDS,
  projectSessionTroopBattleCard,
} from "../src/content/session-troop-roster.js";
import { projectSessionNonUnitBattleCard } from "../src/content/session-card-catalog.js";
import { getCardPortrait, getCardPortraitIds } from "../src/ui/card-portrait-art.js";

const TOWER_IDS = Object.freeze([
  "north:central", "north:lane:left", "north:lane:right",
  "south:central", "south:lane:left", "south:lane:right",
]);
const VIEWPORTS = Object.freeze([
  { height: 844, scale: 34 / 64, width: 390 },
  { height: 1_280, scale: 58 / 64, width: 720 },
  { height: 933, scale: 37 / 64, width: 1_440 },
  { height: 720, scale: 31 / 64, width: 1_280 },
]);
const CARD_RECORDS = Object.freeze(Object.fromEntries(EDITABLE_MIXED_DECK_CARD_IDS.map((id) => {
  const card = EDITABLE_DECK_CARD_IDS.includes(id)
    ? projectSessionTroopBattleCard(id)
    : projectSessionNonUnitBattleCard(id);
  return [id, Object.freeze({ cost: card.cost, displayName: card.displayName, id })];
})));
const CARD_KIND_BY_ID = Object.freeze(Object.fromEntries(EDITABLE_MIXED_DECK_CARD_IDS.map((id) => {
  const card = EDITABLE_DECK_CARD_IDS.includes(id)
    ? projectSessionTroopBattleCard(id)
    : projectSessionNonUnitBattleCard(id);
  return [id, card.kind];
})));
assert.deepEqual([...getCardPortraitIds()].toSorted(),
  [...EDITABLE_MIXED_DECK_CARD_IDS].toSorted(),
  "the supported painter identities match the canonical portrait registry");

function makeDeckCase(cardId, position) {
  const others = EDITABLE_MIXED_DECK_CARD_IDS.filter((id) => id !== cardId);
  const hand = [];
  let cursor = 0;
  for (let slot = 0; slot < 4; slot += 1) {
    hand.push(slot === position ? cardId : others[cursor++]);
  }
  const next = position === 4 ? cardId : others[cursor++];
  const queue = [next, ...others.slice(cursor, cursor + 3)];
  const deckIds = [...hand, ...queue];
  assert.equal(new Set(deckIds).size, 8);
  return {
    cards: deckIds.map((id) => CARD_RECORDS[id]),
    deck: { hand, next, queue, sequence: 0 },
    elixir: { tick: 0, sides: {
      north: { accumulator: 0, amount: 10 },
      south: { accumulator: 0, amount: 10 },
    } },
    localSide: "south",
    match: {
      crowns: { north: 0, south: 0 },
      destroyedTowerIds: [],
      phase: "regulation",
      result: null,
      tick: 0,
      towers: TOWER_IDS.map((id) => ({ hitpoints: 1, id })),
    },
    selectedCardId: null,
    target: { cardId, position },
  };
}

function makeStateCase(deckIds, { amount = 10, ended = false, selected = null } = {}) {
  const hand = deckIds.slice(0, 4);
  const queue = deckIds.slice(4);
  return {
    cards: deckIds.map((id) => CARD_RECORDS[id]),
    deck: { hand, next: queue[0], queue, sequence: 0 },
    elixir: { tick: 0, sides: {
      north: { accumulator: 0, amount },
      south: { accumulator: 0, amount },
    } },
    localSide: "south",
    match: {
      crowns: { north: 0, south: 0 },
      destroyedTowerIds: [],
      phase: ended ? "ended" : "regulation",
      result: ended
        ? { crowns: { north: 0, south: 0 }, endedAtTick: 0,
          kind: "draw", reason: "time", winner: null }
        : null,
      tick: 0,
      towers: TOWER_IDS.map((id) => ({ hitpoints: 1, id })),
    },
    selectedCardId: selected,
  };
}

const CARD_POSITIONS = Object.freeze([0, 1, 2, 3, 4]);
const MATRIX_CASES = Object.freeze(EDITABLE_MIXED_DECK_CARD_IDS.flatMap((id) =>
  CARD_POSITIONS.map((position) => makeDeckCase(id, position))));
const MATRIX_STATE_DECK = EDITABLE_MIXED_DECK_CARD_IDS.slice(0, 8);
const STATE_CASES = Object.freeze([
  Object.freeze({ label: "normal", input: makeStateCase(MATRIX_STATE_DECK) }),
  Object.freeze({ label: "selected", input: makeStateCase(MATRIX_STATE_DECK,
    { selected: MATRIX_STATE_DECK[0] }) }),
  Object.freeze({ label: "insufficient", input: makeStateCase(MATRIX_STATE_DECK,
    { amount: 0 }) }),
  Object.freeze({ label: "selected-insufficient", input: makeStateCase(MATRIX_STATE_DECK,
    { amount: 0, selected: MATRIX_STATE_DECK[0] }) }),
  Object.freeze({ label: "ended-neutral", input: makeStateCase(MATRIX_STATE_DECK,
    { amount: 0, ended: true }) }),
  Object.freeze({ label: "ended-with-stale-flags", input: makeStateCase(MATRIX_STATE_DECK,
    { amount: 0, ended: true, selected: MATRIX_STATE_DECK[0] }) }),
]);

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ?? "playwright";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS = process.env.APP_004_ARTIFACTS ??
  join(process.cwd(), "artifacts", "hud-card-painter-test");
const PORTRAIT_FILE_NAMES = new Set(getCardPortraitIds().map((id) =>
  new URL(getCardPortrait(id).src).pathname.split("/").at(-1)));

async function deliverAppFrameNativePlacement(page, frame, plan) {
  const before = await frame.evaluate(() => {
    const controller = globalThis.__hudPainterShippingController;
    const snapshot = JSON.parse(controller.serialize());
    return {
      bridgeDeliveries: JSON.parse(snapshot.bridge).deliveries,
      selectedCardId: controller.state.selectedCardId,
      sessionTick: controller.session.state.tick,
    };
  });
  assert.equal(before.selectedCardId, plan.cardId,
    "the planned card is already selected before its native arena gesture");
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
        ariaHidden: node.getAttribute("aria-hidden"),
        className: node.getAttribute("class"),
        dataUi: node.getAttribute("data-ui"),
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
    for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click"]) {
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
    globalThis.__hudPainterPointerEvents = observations;
    const arena = document.querySelector('[data-ui="arena"]');
    const hitStack = document.elementsFromPoint(expectedClientPoint.x, expectedClientPoint.y)
      .slice(0, 8).map(describe);
    globalThis.__hudPainterPointerDom = {
      activeElement: describe(document.activeElement),
      arena: arena === null ? null : {
        ...describe(arena),
        connected: arena.isConnected,
        outerHtml: arena.outerHTML.slice(0, 500),
      },
      documentVisibility: document.visibilityState,
      expectedClientPoint,
      hitStack,
    };
  }, geometry.expectedClientPoint);
  await page.evaluate((framePath) => {
    const observations = [];
    const describe = (node) => {
      if (!(node instanceof Element)) return { nodeName: node?.nodeName ?? null };
      const bounds = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        className: node.getAttribute("class"),
        height: bounds.height,
        left: bounds.left,
        pointerEvents: style.pointerEvents,
        src: node instanceof HTMLIFrameElement ? node.src : null,
        tagName: node.tagName,
        top: bounds.top,
        width: bounds.width,
      };
    };
    for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click"]) {
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
    globalThis.__hudPainterOuterPointerEvents = observations;
    const iframe = [...document.querySelectorAll("iframe")].find((candidate) => {
      try { return new URL(candidate.src, location.href).pathname.endsWith(framePath); }
      catch { return false; }
    });
    const transformChain = [];
    for (let node = iframe; node instanceof Element; node = node.parentElement) {
      const style = getComputedStyle(node);
      const bounds = node.getBoundingClientRect();
      transformChain.push({
        className: node.getAttribute("class"),
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
    globalThis.__hudPainterOuterFrameDom = {
      activeElement: describe(document.activeElement),
      frame: iframe === undefined ? null : {
        ...describe(iframe),
        clientHeight: iframe.clientHeight,
        clientLeft: iframe.clientLeft,
        clientTop: iframe.clientTop,
        clientWidth: iframe.clientWidth,
        contentDocumentReady: iframe.contentDocument?.readyState ?? null,
        isConnected: iframe.isConnected,
        offsetHeight: iframe.offsetHeight,
        offsetWidth: iframe.offsetWidth,
      },
      innerViewport: { height: innerHeight, width: innerWidth },
      scroll: { x: scrollX, y: scrollY },
      transformChain,
      visibility: document.visibilityState,
    };
  }, "/public/ui-arena-shell.html");
  const [frameDomBefore, outerDomBefore] = await Promise.all([
    frame.evaluate(() => globalThis.__hudPainterPointerDom ?? null),
    page.evaluate(() => globalThis.__hudPainterOuterFrameDom ?? null),
  ]);
  assert.ok(outerDomBefore?.frame, "the public battle iframe is measurable in the outer page");
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
  const after = await frame.evaluate(() => {
    const controller = globalThis.__hudPainterShippingController;
    const snapshot = JSON.parse(controller.serialize());
    return {
      bridgeDeliveries: JSON.parse(snapshot.bridge).deliveries,
      selectedCardId: controller.state.selectedCardId,
      sessionTick: controller.session.state.tick,
    };
  });
  const [framePointerEvents, outerPointerEvents] = await Promise.all([
    frame.evaluate(() => globalThis.__hudPainterPointerEvents ?? []),
    page.evaluate(() => globalThis.__hudPainterOuterPointerEvents ?? []),
  ]);
  const diagnostic = {
    after,
    before,
    frameDom: frameDomBefore,
    framePointerEvents,
    geometry,
    iframeScale: { x: iframeScaleX, y: iframeScaleY },
    outerDom: outerDomBefore,
    outerMousePoint,
    outerPointerEvents,
    plan,
  };
  assert.equal(after.bridgeDeliveries.length, before.bridgeDeliveries.length + 1,
    `one native arena pointer gesture adds exactly one GameInputBridge delivery: ${JSON.stringify(diagnostic)}`);
  const delivery = after.bridgeDeliveries.at(-1);
  const arenaPointerUp = framePointerEvents.find(({ type }) => type === "pointerup");
  assert.ok(arenaPointerUp?.isTrusted === true,
    "the shipped arena observes a trusted pointerup");
  assert.ok(arenaPointerUp.composedPath.some(({ dataUi }) => dataUi === "arena"),
    "the trusted pointer path reaches the shipped arena input element");
  assert.deepEqual({
    x: Math.floor((arenaPointerUp.clientX - geometry.bounds.left - geometry.client.left) *
      18_000 / geometry.client.width),
    y: Math.floor((geometry.bounds.top + geometry.client.top + geometry.client.height -
      arenaPointerUp.clientY) * 32_000 / geometry.client.height),
  }, plan.point, "the scaled native pointer maps to the intended world point");
  assert.deepEqual(delivery.command, {
    cardId: plan.cardId,
    commandId: before.bridgeDeliveries.length + 1,
    point: plan.point,
    slot: plan.slot,
    tick: before.sessionTick,
    type: plan.type,
  });
  assert.deepEqual(delivery.admission, {
    accepted: true,
    commandId: delivery.command.commandId,
    tick: before.sessionTick,
    type: "player-command-admitted",
  });
  return { after, before, delivery, diagnostic };
}

async function serverAddress(stream) {
  let output = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) {
    output += chunk;
    const newline = output.indexOf("\n");
    if (newline >= 0) return JSON.parse(output.slice(0, newline));
  }
  throw new Error("HUD painter server stopped before readiness");
}

test("app-frame startup mounts a visible Canvas with real card pixels", {
  timeout: 180_000,
}, async (t) => {
  mkdirSync(ARTIFACTS, { recursive: true });
  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => {
    server.kill("SIGTERM");
    await once(server, "exit").catch(() => {});
  });
  const address = await serverAddress(server.stdout);
  const { chromium } = await import(PLAYWRIGHT);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({
    deviceScaleFactor: 1,
    viewport: { height: 1_280, width: 1_280 },
  });
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  const response = await page.goto(
    `http://${address.host}:${address.port}/public/ui-arena-shell.html?app-frame=1`,
    { waitUntil: "load" },
  );
  assert.equal(response.status(), 200);
  const paint = await page.evaluate(async () => {
    let moduleState;
    try {
      const { arenaHudController } = await import("/src/ui/arena-shell-entry.js");
      moduleState = { controller: arenaHudController !== null, error: null };
    } catch (error) {
      moduleState = { controller: null, error: String(error?.stack ?? error) };
    }
    const canvas = document.querySelector(
      '.game-ui-hud-frame canvas[data-ui="hud-card-paint"]',
    );
    if (!canvas) return {
      body: document.body.innerHTML.slice(0, 2_000),
      canvasMarkers: [...document.querySelectorAll("canvas")].map((node) => ({
        className: node.className,
        dataset: { ...node.dataset },
        parent: node.parentElement?.className ?? null,
      })),
      dataset: { ...document.body.dataset },
      hudFrameCount: document.querySelectorAll(".game-ui-hud-frame").length,
      hudProjectionCount: document.querySelectorAll('[data-ui="hud-projection"]').length,
      moduleState,
      missingCanvas: true,
    };
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("HUD painter Canvas has no 2D context");
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let opaque = 0;
    let varied = new Set();
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] === 255) opaque += 1;
      if (varied.size < 512) {
        varied.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]},${pixels[index + 3]}`);
      }
    }
    const style = getComputedStyle(canvas);
    const bounds = canvas.getBoundingClientRect();
    const section = document.querySelector('[data-ui="hud-projection"]');
    const timer = document.querySelector('[data-ui="hud-timer"]');
    const resource = document.querySelector('[data-ui="hud-elixir"]');
    const semanticFaces = [...document.querySelectorAll(
      '[data-ui="hud-next"] .hud-card, [data-ui="hud-hand"] .hud-card',
    )];
    return {
      appFrame: document.body.dataset.appFrame,
      bounds: { height: bounds.height, left: bounds.left, top: bounds.top, width: bounds.width },
      canvasConnected: canvas.isConnected,
      canvasSize: { height: canvas.height, width: canvas.width },
      canvasVisible: style.display !== "none" && style.visibility !== "hidden" &&
        Number(style.opacity) > 0,
      hudVisible: Number(getComputedStyle(section).opacity) > 0,
      opaquePixels: opaque,
      resourceVisible: Number(getComputedStyle(resource).opacity) > 0,
      semanticFaceCount: semanticFaces.length,
      semanticFacesHidden: semanticFaces.every((face) => Number(getComputedStyle(face).opacity) === 0),
      timerVisible: Number(getComputedStyle(timer).opacity) > 0,
      uniquePixelValues: varied.size,
    };
  });
  assert.notEqual(paint.missingCanvas, true,
    JSON.stringify({ consoleErrors, moduleState: paint.moduleState, pageErrors,
      body: paint.body, dataset: paint.dataset }, null, 2));
  assert.deepEqual(paint.canvasSize, { height: 172, width: 714 });
  assert.equal(paint.appFrame, "true");
  assert.equal(paint.canvasConnected, true);
  assert.equal(paint.canvasVisible, true);
  assert.equal(paint.hudVisible, true);
  assert.equal(paint.timerVisible, true);
  assert.equal(paint.resourceVisible, true);
  assert.equal(paint.semanticFaceCount, 5);
  assert.equal(paint.semanticFacesHidden, true);
  assert.ok(paint.opaquePixels > 50_000, JSON.stringify(paint));
  assert.ok(paint.uniquePixelValues > 100, JSON.stringify(paint));
  assert.ok(paint.bounds.width > 700 && paint.bounds.height > 160, JSON.stringify(paint));
  assert.deepEqual(pageErrors, []);
  await page.screenshot({ path: join(ARTIFACTS, "integrated-app-frame.png") });
  writeFileSync(join(ARTIFACTS, "integrated-paint.json"),
    `${JSON.stringify({ pageErrors, paint }, null, 2)}\n`);

  const standalonePage = await browser.newPage({
    deviceScaleFactor: 1,
    viewport: { height: 1_280, width: 720 },
  });
  const standaloneForbiddenRequests = [];
  standalonePage.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith("/src/ui/hud-card-painter.js") ||
        request.resourceType() === "font" ||
        PORTRAIT_FILE_NAMES.has(url.pathname.split("/").at(-1))) {
      standaloneForbiddenRequests.push({ path: url.pathname, type: request.resourceType() });
    }
  });
  const standaloneResponse = await standalonePage.goto(
    `http://${address.host}:${address.port}/public/ui-arena-shell.html`,
    { waitUntil: "load" },
  );
  assert.equal(standaloneResponse.status(), 200);
  const standaloneState = await standalonePage.evaluate(() => ({
    appFrame: document.body.dataset.appFrame ?? null,
    canvasCount: document.querySelectorAll("canvas").length,
    portraitCount: document.querySelectorAll(".hud-card__portrait-image").length,
  }));
  assert.deepEqual(standaloneState, { appFrame: null, canvasCount: 0, portraitCount: 0 });
  assert.deepEqual(standaloneForbiddenRequests, [],
    "standalone import does not fetch painter, portrait or font resources");
  const projectionSource = readFileSync(
    new URL("../src/ui/game-ui-projection.js", import.meta.url), "utf8",
  );
  assert.doesNotMatch(projectionSource, /from\s+["']\.\/hud-card-painter\.js["']/u,
    "the standalone projection has no static painter dependency");
  await standalonePage.close();

  const transactions = await page.evaluate(async () => {
    const [
      { createShippedGameSessionSetup, getPreparedShippedAppFrameHud },
      { GameSession },
      { createGameUiFrame, createGameUiOptions, mountGameUiProjection },
    ] = await Promise.all([
      import("/src/ui/game-browser-entry.js"),
      import("/src/sim/game-session.js"),
      import("/src/ui/game-ui-projection.js"),
    ]);
    const shell = document.querySelector("[data-ui='arena-shell']");
    const factory = getPreparedShippedAppFrameHud(document);
    const session = new GameSession(createShippedGameSessionSetup());
    const createLayers = () => {
      const host = document.createElement("div");
      host.style.cssText = "position:absolute;inset:0;z-index:40;pointer-events:none";
      const layers = {};
      for (const name of ["combat", "effects", "feedback", "hud"]) {
        const layer = document.createElement("div");
        layer.className = `game-browser-layer game-browser-layer--${name}`;
        layers[name] = layer;
        host.appendChild(layer);
      }
      shell.appendChild(host);
      return { host, layers };
    };
    const hash = (canvas) => {
      const { data } = canvas.getContext("2d", { willReadFrequently: true })
        .getImageData(0, 0, canvas.width, canvas.height);
      let value = 2_166_136_261;
      for (const byte of data) value = Math.imul(value ^ byte, 16_777_619) >>> 0;
      return value.toString(16).padStart(8, "0");
    };

    const first = createLayers();
    const projection = mountGameUiProjection(first.layers, factory);
    const selectedCardId = session.state.decks.south.hand[0];
    projection.project(createGameUiFrame(session));
    const root = first.layers.hud.querySelector(".game-ui-hud-frame");
    const canvas = root.querySelector('canvas[data-ui="hud-card-paint"]');
    const canvasNode = canvas;
    const aBefore = hash(canvas);
    projection.project(createGameUiFrame(session,
      createGameUiOptions("south", selectedCardId)));
    const bHash = hash(canvas);
    projection.project(createGameUiFrame(session));
    const aAfter = hash(canvas);
    const aToBToA = {
      sameCanvas: canvas === canvasNode,
      firstHash: aBefore,
      secondHash: aAfter,
      changedInB: aBefore !== bHash,
      restoredA: aBefore === aAfter,
    };

    const equivalentBefore = hash(canvas);
    const equivalentSize = { height: canvas.height, width: canvas.width };
    session.step();
    projection.project(createGameUiFrame(session));
    const equivalent = {
      sameCanvas: root.querySelector('canvas[data-ui="hud-card-paint"]') === canvasNode,
      samePixels: hash(canvas) === equivalentBefore,
      sameSize: canvas.width === equivalentSize.width && canvas.height === equivalentSize.height,
    };

    const forged = document.createElement("canvas");
    forged.dataset.ui = "hud-card-paint";
    forged.dataset.painterRevision = "hud-card-painter-1";
    forged.width = 300;
    forged.height = 150;
    root.appendChild(forged);
    const forgedMarkup = root.outerHTML;
    const forgedPixels = hash(canvas);
    let forgedError = null;
    try {
      session.step();
      projection.project(createGameUiFrame(session));
    } catch (error) {
      forgedError = String(error?.message ?? error);
    }
    const forgedMarker = {
      error: forgedError,
      canHandoff: projection.canHandoff(),
      sameMarkup: root.outerHTML === forgedMarkup,
      samePixels: hash(canvas) === forgedPixels,
      dimensions: { height: forged.height, width: forged.width },
    };
    root.removeChild(forged);

    const beforeFailurePixels = hash(canvas);
    const beforeFailureMarkup = root.outerHTML;
    const contextPrototype = Object.getPrototypeOf(canvas.getContext("2d"));
    const putDescriptor = Object.getOwnPropertyDescriptor(contextPrototype, "putImageData");
    if (!putDescriptor?.writable || !putDescriptor.configurable) {
      throw new Error("Canvas pixel-write method cannot be fault-injected for rollback coverage");
    }
    let failOnce = true;
    let injectedWrites = 0;
    Object.defineProperty(contextPrototype, "putImageData", {
      ...putDescriptor,
      value(...args) {
        if (this.canvas === canvas && failOnce) {
          failOnce = false;
          injectedWrites += 1;
          throw new Error("injected HUD pixel commit failure");
        }
        return putDescriptor.value.apply(this, args);
      },
    });
    let recoveredFailure = null;
    try {
      projection.project(createGameUiFrame(session,
        createGameUiOptions("south", selectedCardId)));
    } catch (error) {
      recoveredFailure = String(error?.message ?? error);
    } finally {
      Object.defineProperty(contextPrototype, "putImageData", putDescriptor);
    }
    const recovered = {
      error: recoveredFailure,
      injectedWrites,
      canHandoff: projection.canHandoff(),
      sameCanvas: root.querySelector('canvas[data-ui="hud-card-paint"]') === canvasNode,
      sameMarkup: root.outerHTML === beforeFailureMarkup,
      samePixels: hash(canvas) === beforeFailurePixels,
    };
    projection.cleanup();
    first.host.remove();

    const second = createLayers();
    const poisonedProjection = mountGameUiProjection(second.layers, factory);
    poisonedProjection.project(createGameUiFrame(session));
    const poisonedRoot = second.layers.hud.querySelector(".game-ui-hud-frame");
    const poisonedCanvas = poisonedRoot.querySelector('canvas[data-ui="hud-card-paint"]');
    const priorMarkup = poisonedRoot.outerHTML;
    const poisonPrototype = Object.getPrototypeOf(poisonedCanvas.getContext("2d"));
    const poisonDescriptor = Object.getOwnPropertyDescriptor(poisonPrototype, "putImageData");
    let poisonError = null;
    Object.defineProperty(poisonPrototype, "putImageData", {
      ...poisonDescriptor,
      value(...args) {
        if (this.canvas === poisonedCanvas) throw new Error("injected persistent HUD pixel failure");
        return poisonDescriptor.value.apply(this, args);
      },
    });
    try {
      poisonedProjection.project(createGameUiFrame(session,
        createGameUiOptions("south", selectedCardId)));
    } catch (error) {
      poisonError = { name: error.name, message: error.message };
    } finally {
      Object.defineProperty(poisonPrototype, "putImageData", poisonDescriptor);
    }
    const poisoned = {
      canHandoff: poisonedProjection.canHandoff(),
      error: poisonError,
      priorDomRestored: poisonedRoot.outerHTML === priorMarkup,
    };
    poisonedProjection.cleanup();
    second.host.remove();
    return { aToBToA, equivalent, forgedMarker, poisoned, recovered };
  });
  assert.deepEqual(transactions.aToBToA, {
    changedInB: true,
    firstHash: transactions.aToBToA.firstHash,
    restoredA: true,
    sameCanvas: true,
    secondHash: transactions.aToBToA.firstHash,
  });
  assert.deepEqual(transactions.recovered, {
    canHandoff: true,
    error: "injected HUD pixel commit failure",
    injectedWrites: 1,
    sameCanvas: true,
    sameMarkup: true,
    samePixels: true,
  });
  assert.deepEqual(transactions.equivalent, {
    sameCanvas: true,
    samePixels: true,
    sameSize: true,
  });
  assert.deepEqual(transactions.forgedMarker, {
    error: "game UI prior HUD painter surface is not authentic",
    canHandoff: true,
    sameMarkup: true,
    samePixels: true,
    dimensions: { height: 150, width: 300 },
  });
  assert.equal(transactions.poisoned.canHandoff, false);
  assert.equal(transactions.poisoned.error?.name, "AggregateError");
  assert.equal(transactions.poisoned.priorDomRestored, true);

  await page.evaluate(async () => {
    const { getPreparedShippedAppFrameHud } =
      await import("/src/ui/game-browser-entry.js");
    const canvas = document.createElement("canvas");
    canvas.dataset.ui = "hud-card-paint";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = [
      "position:fixed", "left:0", "top:0", "z-index:9999", "display:block",
      "width:714px", "height:172px", "transform-origin:top left",
      "pointer-events:none", "opacity:1",
    ].join(";");
    document.body.appendChild(canvas);
    globalThis.__hudCardPainterMatrix = {
      canvas,
      painter: getPreparedShippedAppFrameHud(document).create(),
    };
  });

  const matrixResults = [];
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const result = await page.evaluate(async ({ cases, scale, states }) => {
      const { createHudViewModel } = await import("/src/ui/hud-state.js");
      const { canvas, painter } = globalThis.__hudCardPainterMatrix;
      const canvasNode = canvas;
      document.documentElement.dataset.combatFrameScale = String(scale);
      canvas.style.transform = `scale(${scale})`;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      const hash = (data) => {
        let value = 2_166_136_261;
        for (const byte of data) value = Math.imul(value ^ byte, 16_777_619) >>> 0;
        return value.toString(16).padStart(8, "0");
      };
      const pixelsHash = () => hash(context.getImageData(0, 0, canvas.width, canvas.height).data);
      const regionHash = (x, y, width, height) => {
        const data = context.getImageData(
          Math.max(0, Math.floor(x * sx)), Math.max(0, Math.floor(y * sy)),
          Math.max(1, Math.floor(width * sx)), Math.max(1, Math.floor(height * sy)),
        ).data;
        return hash(data);
      };
      const paint = (input) => {
        const view = createHudViewModel(input);
        const transaction = painter.stage(view, canvas);
        transaction.commit();
        transaction.finalize();
        return view;
      };
      const { target: firstTarget, ...firstInput } = cases[0];
      paint(firstInput);
      const sx = canvas.width / 714;
      const sy = canvas.height / 172;
      const cropHash = (x, y, width = 40, height = 40) => {
        const left = Math.max(0, Math.floor(x * sx));
        const top = Math.max(0, Math.floor(y * sy));
        const sampleWidth = Math.max(1, Math.floor(width * sx));
        const sampleHeight = Math.max(1, Math.floor(height * sy));
        const data = context.getImageData(left, top, sampleWidth, sampleHeight).data;
        let alphaMinimum = 255;
        let opaquePixels = 0;
        const colors = new Set();
        const transparentPixels = [];
        for (let index = 0; index < data.length; index += 4) {
          alphaMinimum = Math.min(alphaMinimum, data[index + 3]);
          if (data[index + 3] > 0) opaquePixels += 1;
          else if (transparentPixels.length < 4) {
            const pixel = index / 4;
            const pixelX = left + pixel % sampleWidth;
            const pixelY = top + Math.floor(pixel / sampleWidth);
            transparentPixels.push({
              backingPixel: { x: pixelX, y: pixelY },
              logicalPixel: { x: (pixelX + 0.5) / sx, y: (pixelY + 0.5) / sy },
            });
          }
          colors.add(`${data[index]},${data[index + 1]},${data[index + 2]}`);
        }
        return { alphaMinimum, colors: colors.size, height: sampleHeight,
          hash: hash(data), logicalSampleRect: { height, width, x, y },
          opaquePixels, sampleBackingRect: { height: sampleHeight, left, top,
            width: sampleWidth }, transparentPixels, width: sampleWidth };
      };
      const targetSamples = [];
      for (const input of cases) {
        const { target, ...hudInput } = input;
        const view = paint(hudInput);
        const { cardId, position } = target;
        const actualId = position === 4 ? view.next.id : view.hand[position].id;
        const x = position === 4 ? 5 : [147, 289, 431, 573][position];
        targetSamples.push({
          actualId,
          cardId,
          cardBounds: { height: 162, width: 136, x, y: 5 },
          position,
          sample: cropHash(x + 60, 40),
        });
      }
      const stateSamples = Object.create(null);
      for (const { label, input } of states) {
        paint(input);
        const fullHash = pixelsHash();
        const selectedX = 147;
        stateSamples[label] = {
          badgeHash: regionHash(selectedX + 8, 13, 46, 46),
          fullHash,
          haloHash: regionHash(selectedX - 5, 35, 5, 100),
        };
      }
      const normalInput = states.find(({ label }) => label === "normal").input;
      const selectedInput = states.find(({ label }) => label === "selected").input;
      paint(normalInput);
      const normalHash = pixelsHash();
      paint(selectedInput);
      const selectedHash = pixelsHash();
      paint(normalInput);
      const hashAAfter = pixelsHash();
      const bounds = canvas.getBoundingClientRect();
      const style = getComputedStyle(canvas);
      return {
        backing: { height: canvas.height, width: canvas.width },
        bounds: { height: bounds.height, width: bounds.width },
        canvasVisible: canvas.isConnected && style.visibility !== "hidden" &&
          Number(style.opacity) > 0,
        devicePixelRatio: devicePixelRatio,
        normalAgainHash: hashAAfter,
        normalHash,
        sameCanvasAtoBtoA: canvas === canvasNode,
        scale,
        selectedHash,
        states: stateSamples,
        targets: targetSamples,
      };
    }, { cases: MATRIX_CASES, scale: viewport.scale, states: STATE_CASES });
    writeFileSync(join(ARTIFACTS, `painter-matrix-${viewport.width}x${viewport.height}.json`),
      `${JSON.stringify(result, null, 2)}\n`);
    await page.screenshot({ path: join(ARTIFACTS,
      `painter-matrix-${viewport.width}x${viewport.height}.png`) });
    const expectedBacking = {
      height: Math.round(172 * viewport.scale),
      width: Math.round(714 * viewport.scale),
    };
    assert.deepEqual(result.backing, expectedBacking, `${viewport.width}x${viewport.height} backing size`);
    assert.equal(result.canvasVisible, true, `${viewport.width}x${viewport.height} visible painter surface`);
    assert.equal(result.devicePixelRatio, 1);
    assert.ok(Math.abs(result.bounds.width - 714 * viewport.scale) < 0.01,
      `${viewport.width}x${viewport.height} composited width ${result.bounds.width}`);
    assert.ok(Math.abs(result.bounds.height - 172 * viewport.scale) < 0.01,
      `${viewport.width}x${viewport.height} composited height ${result.bounds.height}`);
    assert.equal(result.sameCanvasAtoBtoA, true);
    assert.equal(result.targets.length,
      EDITABLE_MIXED_DECK_CARD_IDS.length * CARD_POSITIONS.length,
      `${viewport.width}x${viewport.height} target matrix covers every card at every position`);
    const badTargets = result.targets.filter(({ actualId, cardId, sample }) =>
      actualId !== cardId || sample.alphaMinimum !== 255 || sample.colors <= 1);
    assert.equal(badTargets.length, 0,
      `${viewport.width}x${viewport.height} every target face has opaque varied RGBA pixels: ` +
        JSON.stringify({ count: badTargets.length, examples: badTargets.slice(0, 4) }));
    const faceHashes = new Set(result.targets.map(({ sample }) => sample.hash));
    assert.ok(faceHashes.size >= 20,
      `${viewport.width}x${viewport.height} portrait crops distinguish identities: ${faceHashes.size}`);
    for (const cardId of EDITABLE_MIXED_DECK_CARD_IDS) {
      const positions = result.targets.filter((sample) => sample.cardId === cardId)
        .map(({ position }) => position).toSorted();
      assert.deepEqual(positions, CARD_POSITIONS,
        `${viewport.width}x${viewport.height} paints ${cardId} in all four hand slots and Next`);
    }
    assert.deepEqual(result.normalAgainHash, result.normalHash,
      `${viewport.width}x${viewport.height} A→B→A restores exact Canvas RGBA`);
    assert.notEqual(result.selectedHash, result.normalHash);
    assert.notEqual(result.states.selected.haloHash, result.states.normal.haloHash,
      `${viewport.width}x${viewport.height} selection changes the actual halo pixels`);
    assert.equal(result.states.insufficient.haloHash, result.states.normal.haloHash,
      `${viewport.width}x${viewport.height} insufficient state has no selection halo`);
    assert.notEqual(result.states.insufficient.badgeHash, result.states.normal.badgeHash,
      `${viewport.width}x${viewport.height} insufficient state changes actual cost-badge pixels`);
    assert.notEqual(result.states["selected-insufficient"].haloHash,
      result.states.normal.haloHash,
      `${viewport.width}x${viewport.height} selected and insufficient state retains its halo`);
    assert.notEqual(result.states["selected-insufficient"].badgeHash,
      result.states.selected.badgeHash,
      `${viewport.width}x${viewport.height} selected and insufficient state changes cost-badge pixels`);
    assert.equal(result.states["ended-neutral"].haloHash, result.states.normal.haloHash,
      `${viewport.width}x${viewport.height} ended state suppresses the halo`);
    assert.equal(result.states["ended-neutral"].fullHash,
      result.states["ended-with-stale-flags"].fullHash,
    `${viewport.width}x${viewport.height} ended pixels ignore stale selected/insufficient flags`);
    await page.screenshot({ path: join(ARTIFACTS,
      `canvas-${viewport.width}x${viewport.height}.png`) });
    matrixResults.push({ viewport, backing: result.backing, faceHashCount: faceHashes.size,
      stateSamples: result.states, targetCount: result.targets.length });
  }
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  writeFileSync(join(ARTIFACTS, "painter-matrix.json"),
    `${JSON.stringify({ matrixResults, transactions }, null, 2)}\n`);
});

test("public app-frame states repeat across fresh scaled iframe contexts", {
  timeout: 900_000,
}, async (t) => {
  const outputRoot = join(ARTIFACTS, "shipping-repeatability");
  mkdirSync(outputRoot, { recursive: true });
  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let browser;
  t.after(async () => {
    await browser?.close().catch(() => {});
    server.kill("SIGTERM");
    await once(server, "exit").catch(() => {});
  });
  const address = await serverAddress(server.stdout);
  const { chromium } = await import(PLAYWRIGHT);
  browser = await chromium.launch({
    args: [
      "--force-color-profile=srgb",
      "--force-device-scale-factor=1",
      "--disable-gpu",
      "--use-angle=swiftshader",
      "--font-render-hinting=none",
      "--disable-lcd-text",
    ],
    executablePath: CHROME,
    headless: true,
  });
  const pageErrors = [];
  const consoleErrors = [];
  const costs = Object.fromEntries(Object.values(CARD_RECORDS).map(({ cost, id }) => [id, cost]));
  const captureContext = async (viewport, runIndex, reducedMotion) => {
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      reducedMotion: reducedMotion ? "reduce" : "no-preference",
      viewport: { height: viewport.height, width: viewport.width },
    });
    try {
      const page = await context.newPage();
      page.on("pageerror", (error) => pageErrors.push(String(error)));
      page.on("console", (message) => {
        if (message.type() === "error") consoleErrors.push(message.text());
      });
      const response = await page.goto(
        `http://${address.host}:${address.port}/public/index.html`,
        { waitUntil: "load" },
      );
      assert.equal(response.status(), 200);
      await page.locator('[data-nav-to="battle"]').click();
      await page.locator(".battle-frame").waitFor({ state: "visible" });
      await page.frameLocator(".battle-frame").locator('[data-ui="arena"]')
        .waitFor({ state: "visible" });
      const child = page.frames().find((frame) => frame.url().includes("app-frame=1"));
      assert.ok(child, "the public app shell loads the shipped app-frame route");
      const ready = await child.evaluate(async () => {
        const [{ arenaHudController }, { createShippedGameSessionSetup }, { GameSession }] =
          await Promise.all([
            import("/src/ui/arena-shell-entry.js"),
            import("/src/ui/game-browser-entry.js"),
            import("/src/sim/game-session.js"),
          ]);
        const controller = arenaHudController;
        const manualStep = controller.enterManualStepMode();
        const session = new GameSession(
          createShippedGameSessionSetup(2, "live-seed-2-terminal"),
        );
        controller.restore(JSON.stringify({
          bridge: JSON.stringify({ deliveries: [], version: 1 }),
          running: false,
          session: session.serialize(),
          version: 1,
        }));
        controller.stepMany(60);
        globalThis.__hudPainterShippingController = controller;
        const frameScale = Number(document.documentElement.dataset.combatFrameScale);
        const iframe = window.frameElement;
        const parentScale = iframe === null
          ? null : new DOMMatrixReadOnly(getComputedStyle(iframe).transform).a;
        return {
          appFrame: document.body.dataset.appFrame ?? null,
          bodyCssPixels: Number(document.documentElement.dataset.combatBodyCssPixels),
          frameScale,
          manualStep,
          parentScale,
          state: {
            amount: controller.session.state.elixir.sides.south.amount,
            hand: [...controller.session.state.decks.south.hand],
            phase: controller.session.state.clock.phase,
            sessionTick: controller.state.sessionTick,
            terminal: controller.state.terminal,
          },
        };
      });
      assert.equal(ready.appFrame, "true");
      assert.equal(ready.manualStep, true);
      assert.equal(ready.bodyCssPixels, viewport.width <= 600 ? 13 : 26);
      assert.ok(ready.frameScale > 0 && ready.frameScale <= 1);
      assert.equal(ready.parentScale, ready.frameScale,
        "the painter receives the parent app-shell's actual iframe scale");
      assert.equal(ready.state.sessionTick, 60);

      const runDirectory = join(outputRoot,
        `${viewport.width}x${viewport.height}`, reducedMotion ? "reduced" : `run-${runIndex}`);
      mkdirSync(runDirectory, { recursive: true });
      const capture = async (label) => {
        const canvas = await child.evaluate(async () => {
          const node = document.querySelector(
            '.game-ui-hud-frame canvas[data-ui="hud-card-paint"]',
          );
          if (!node) throw new Error("the shipped app-frame lost its painter Canvas");
          const style = getComputedStyle(node);
          const context = node.getContext("2d", { willReadFrequently: true });
          if (!context) throw new Error("the shipped painter Canvas has no 2D context");
          const pixels = context.getImageData(0, 0, node.width, node.height).data;
          const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", pixels));
          let opaquePixels = 0;
          const colors = new Set();
          for (let index = 0; index < pixels.length; index += 4) {
            if (pixels[index + 3] > 0) opaquePixels += 1;
            if (colors.size < 512) {
              colors.add(`${pixels[index]},${pixels[index + 1]},${pixels[index + 2]},${pixels[index + 3]}`);
            }
          }
          const controller = globalThis.__hudPainterShippingController;
          const state = controller.session.state;
          const bounds = node.getBoundingClientRect();
          return {
            backing: { height: node.height, width: node.width },
            bounds: { height: bounds.height, width: bounds.width },
            canvasConnected: node.isConnected,
            canvasVisible: style.display !== "none" && style.visibility !== "hidden" &&
              Number(style.opacity) > 0 && bounds.width > 0 && bounds.height > 0,
            colorCount: colors.size,
            opaquePixels,
            phase: state.clock.phase,
            rgbaSha256: [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join(""),
            state: {
              amount: state.elixir.sides.south.amount,
              domTick: controller.state.domTick,
              hand: [...state.decks.south.hand],
              phase: state.clock.phase,
              selectedCardId: controller.state.selectedCardId,
              sessionTick: controller.state.sessionTick,
              terminal: controller.state.terminal,
            },
            reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
          };
        });
        assert.equal(canvas.canvasConnected, true);
        assert.equal(canvas.canvasVisible, true);
        assert.equal(canvas.reducedMotion, reducedMotion);
        assert.deepEqual(canvas.backing, {
          height: Math.round(172 * ready.frameScale),
          width: Math.round(714 * ready.frameScale),
        });
        assert.ok(canvas.opaquePixels > canvas.backing.width * canvas.backing.height / 2,
          `${label} has substantial actual RGBA paint: ${JSON.stringify(canvas)}`);
        assert.ok(canvas.colorCount > 100,
          `${label} has varied actual card pixels: ${JSON.stringify(canvas)}`);
        await page.mouse.move(0, 0);
        const screenshot = await page.locator(".battle-frame").screenshot();
        const screenshotPath = join(runDirectory, `${label}.png`);
        writeFileSync(screenshotPath, screenshot);
        return {
          canvas: {
            backing: canvas.backing,
            bounds: canvas.bounds,
            colorCount: canvas.colorCount,
            opaquePixels: canvas.opaquePixels,
            rgbaSha256: canvas.rgbaSha256,
            state: canvas.state,
          },
          screenshot: {
            bytes: screenshot.length,
            path: screenshotPath,
            sha256: createHash("sha256").update(screenshot).digest("hex"),
          },
        };
      };

      const states = Object.create(null);
      states.initial = await capture("initial");
      const selectedId = await child.evaluate(() =>
        globalThis.__hudPainterShippingController.session.state.decks.south.hand[0]);
      await child.locator(`[data-ui="card-slot"][data-card-id="${selectedId}"]`).click();
      const selected = await child.evaluate(() =>
        globalThis.__hudPainterShippingController.state.selectedCardId);
      assert.equal(selected, selectedId, "native slot input selects the actual card");
      assert.equal(CARD_KIND_BY_ID[selectedId], "unit",
        "the default selected witness is deployable through the troop input protocol");
      states.selected = await capture("selected");
      await deliverAppFrameNativePlacement(page, child, {
        cardId: selectedId,
        point: { x: 1_500, y: 1_000 },
        slot: 0,
        type: "deploy",
      });
      await child.evaluate(() =>
        globalThis.__hudPainterShippingController.stepMany(1));

      let drainRounds = 0;
      for (;;) {
        const wallet = await child.evaluate(() => {
          const controller = globalThis.__hudPainterShippingController;
          return {
            amount: controller.session.state.elixir.sides.south.amount,
            hand: [...controller.session.state.decks.south.hand],
          };
        });
        if (wallet.hand.some((id) => costs[id] > wallet.amount)) break;
        assert.ok(drainRounds < 8, "manual native deployments reach insufficient elixir");
        const target = wallet.hand.reduce((best, id) =>
          CARD_KIND_BY_ID[id] === "unit" && costs[id] <= wallet.amount &&
            costs[id] < costs[best] ? id : best,
        wallet.hand.find((id) => CARD_KIND_BY_ID[id] === "unit" && costs[id] <= wallet.amount));
        if (target === undefined) {
          await child.evaluate(() =>
            globalThis.__hudPainterShippingController.stepMany(60));
          continue;
        }
        const selectedTarget = await child.evaluate(() =>
          globalThis.__hudPainterShippingController.state.selectedCardId);
        if (selectedTarget !== target) {
          await child.locator(`[data-ui="card-slot"][data-card-id="${target}"]`).click();
        }
        const selectedAfterClick = await child.evaluate(() =>
          globalThis.__hudPainterShippingController.state.selectedCardId);
        assert.equal(selectedAfterClick, target,
          `native card click selects ${target}, actual selection ${selectedAfterClick}`);
        const nativePlacement = await deliverAppFrameNativePlacement(page, child, {
          cardId: target,
          point: { x: 1_500, y: 1_000 },
          slot: wallet.hand.indexOf(target),
          type: "deploy",
        });
        const progressed = await child.evaluate(() => {
          const controller = globalThis.__hudPainterShippingController;
          const beforeHand = [...controller.session.state.decks.south.hand];
          const beforeAmount = controller.session.state.elixir.sides.south.amount;
          controller.stepMany(1);
          return {
            amount: controller.session.state.elixir.sides.south.amount,
            beforeAmount,
            beforeHand: beforeHand,
            hand: [...controller.session.state.decks.south.hand],
          };
        });
        assert.ok(progressed.amount !== progressed.beforeAmount ||
          progressed.hand.some((id, index) => id !== progressed.beforeHand[index]),
        `trusted arena input advances the elixir wallet or deck cycle: ${JSON.stringify({ target, nativePlacement, progressed })}`);
        drainRounds += 1;
      }
      const insufficientCount = await child.locator(
        '[data-ui="hud-hand"] .hud-card[data-insufficient="true"]',
      ).count();
      assert.ok(insufficientCount > 0, "the insufficient state is visible in the actual frame");
      states.insufficient = await capture("insufficient");

      const terminalTarget = await child.evaluate((costMap) => {
        const controller = globalThis.__hudPainterShippingController;
        let amount = controller.session.state.elixir.sides.south.amount;
        let target;
        for (let index = 0; index < 20 && target === undefined; index += 1) {
          target = [...controller.session.state.decks.south.hand]
            .find((id) => costMap[id] <= amount);
          if (target === undefined) {
            controller.stepMany(60);
            amount = controller.session.state.elixir.sides.south.amount;
          }
        }
        return target ?? null;
      }, costs);
      assert.ok(terminalTarget, "terminal witness has an affordable selected card");
      await child.locator(`[data-ui="card-slot"][data-card-id="${terminalTarget}"]`).click();
      let terminal = false;
      for (let index = 0; index < 40 && !terminal; index += 1) {
        terminal = await child.evaluate(() =>
          globalThis.__hudPainterShippingController.fastForwardSegment(600) &&
          globalThis.__hudPainterShippingController.state.terminal);
      }
      assert.equal(terminal, true, "the public manual-step session reaches a terminal frame");
      states.ended = await capture("ended");
      assert.equal(states.ended.canvas.state.terminal, true);
      assert.equal(states.ended.canvas.state.phase, "ended");
      return { frameScale: ready.frameScale, reducedMotion, states };
    } finally {
      await context.close();
    }
  };

  const repeatability = [];
  for (const viewport of VIEWPORTS) {
    const runs = [];
    for (let runIndex = 1; runIndex <= 4; runIndex += 1) {
      runs.push(await captureContext(viewport, runIndex, false));
    }
    for (const state of ["initial", "selected", "insufficient", "ended"]) {
      const stateRuns = runs.map((run) => run.states[state]);
      const canvasHashes = stateRuns.map(({ canvas }) => canvas.rgbaSha256);
      const screenshotHashes = stateRuns.map(({ screenshot }) => screenshot.sha256);
      const stateSummaries = stateRuns.map(({ canvas }) => JSON.stringify(canvas.state));
      assert.equal(new Set(canvasHashes).size, 1,
        `${viewport.width}x${viewport.height} ${state} Canvas RGBA repeats across four fresh contexts: ${canvasHashes.join(",")}`);
      assert.equal(new Set(screenshotHashes).size, 1,
        `${viewport.width}x${viewport.height} ${state} iframe screenshot repeats across four fresh contexts: ${screenshotHashes.join(",")}`);
      assert.equal(new Set(stateSummaries).size, 1,
        `${viewport.width}x${viewport.height} ${state} session state repeats across four fresh contexts`);
    }
    repeatability.push({
      viewport: { height: viewport.height, width: viewport.width },
      frameScale: runs[0].frameScale,
      runs,
    });
  }

  const reducedViewport = VIEWPORTS.find(({ width, height }) => width === 720 && height === 1_280);
  const reduced = await captureContext(reducedViewport, 1, true);
  for (const state of ["initial", "selected", "insufficient", "ended"]) {
    assert.equal(reduced.states[state].canvas.rgbaSha256,
      repeatability.find(({ viewport }) => viewport.width === 720 && viewport.height === 1_280)
        .runs[0].states[state].canvas.rgbaSha256,
      `reduced-motion ${state} preserves actual Canvas RGBA`);
  }
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(consoleErrors, []);
  writeFileSync(join(outputRoot, "repeatability.json"),
    `${JSON.stringify({ pageErrors, consoleErrors, reduced, repeatability }, null, 2)}\n`);
});
