import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import test from "node:test";

import { buildRelease } from "../scripts/build-release.js";
import { EDITABLE_MIXED_DECK_CARD_IDS } from "../src/content/editable-deck.js";
import {
  EDITABLE_DECK_CARD_IDS,
  projectSessionTroopBattleCard,
} from "../src/content/session-troop-roster.js";
import { projectSessionNonUnitBattleCard } from "../src/content/session-card-catalog.js";
import { getCardPortrait, getCardPortraitIds } from "../src/ui/card-portrait-art.js";
import { createHudViewModel, getHudMarkup } from "../src/ui/hud-state.js";

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS = process.env.APP_004_ARTIFACTS ??
  new URL("../artifacts/app-004-round-1/", import.meta.url).pathname;
const WORKSPACE_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const HUD_TOWER_IDS = Object.freeze([
  "north:central",
  "north:lane:left",
  "north:lane:right",
  "south:central",
  "south:lane:left",
  "south:lane:right",
]);
const HUD_FRAME_SCALES = Object.freeze({
  "390x844": 34 / 64,
  "720x1280": 58 / 64,
  "1440x933": 37 / 64,
  "1280x720": 35 / 64,
});

async function serverAddress(stream) {
  let output = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) {
    output += chunk;
    const newline = output.indexOf("\n");
    if (newline >= 0) return JSON.parse(output.slice(0, newline));
  }
  throw new Error("battle HUD release server stopped before readiness");
}

async function safePageTarget(page, selector) {
  await page.waitForFunction((targetSelector) => {
    const target = document.querySelector(targetSelector);
    const nav = document.querySelector(".app-nav");
    if (!target || !nav) return false;
    const bounds = target.getBoundingClientRect();
    const navBounds = nav.getBoundingClientRect();
    const hit = document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
    return bounds.width > 0 && bounds.height >= 44 && bounds.top >= 0 &&
      bounds.bottom <= innerHeight && bounds.bottom <= navBounds.top &&
      (target === hit || target.contains(hit));
  }, selector, { timeout: 7_000 });
  await page.locator(selector).click({ timeout: 7_000 });
}

function intersects(left, right) {
  return left.left < right.right && left.right > right.left &&
    left.top < right.bottom && left.bottom > right.top;
}

async function cardFrameDeployment(frame, cardId) {
  return frame.evaluate(async (expectedId) => {
    const { arenaHudController } = await import("/src/ui/arena-shell-entry.js");
    return arenaHudController.session.replay.find(({ side, type, deployment }) =>
      side === "south" && type === "session-deployed" &&
      deployment.cardId === expectedId) ?? null;
  }, cardId);
}

async function cardFrameDiagnostics(frame) {
  return frame.evaluate(async () => {
    const { arenaHudController } = await import("/src/ui/arena-shell-entry.js");
    return {
      input: arenaHudController.input,
      pointers: globalThis.__appBattlePointerEvidence ?? [],
      feedback: arenaHudController.placementFeedback,
      state: arenaHudController.state,
    };
  });
}

function createHudProbeData(origin) {
  const ids = [...EDITABLE_MIXED_DECK_CARD_IDS];
  const portraitIds = [...getCardPortraitIds()];
  assert.equal(ids.length, portraitIds.length,
    "the authoritative mixed-card and portrait registries have matching populations");
  assert.equal(new Set(ids).size, ids.length, "the authoritative mixed registry has unique card IDs");
  const cardsById = Object.fromEntries(ids.map((id) => {
    const card = EDITABLE_DECK_CARD_IDS.includes(id)
      ? projectSessionTroopBattleCard(id)
      : projectSessionNonUnitBattleCard(id);
    assert.equal(card.id, id, `${id} resolves through its canonical card projection`);
    return [id, { cost: card.cost, displayName: card.displayName, id: card.id }];
  }));
  assert.deepEqual(Object.keys(cardsById), ids,
    `all ${ids.length} registry IDs have one canonical name and cost record`);
  assert.deepEqual(portraitIds.toSorted(), ids.toSorted(),
    "each supported card has exactly one original portrait mapping");
  const portraits = {};
  for (const id of ids) {
    const portrait = getCardPortrait(id);
    assert.ok(portrait, `${id} has a mapped original portrait`);
    const sourcePath = fileURLToPath(portrait.src);
    const pathFromRoot = relative(WORKSPACE_ROOT, sourcePath).split("\\").join("/");
    assert.ok(pathFromRoot.startsWith("public/assets/"),
      `${id} portrait stays in the authored asset root: ${pathFromRoot}`);
    portraits[id] = {
      cell: portrait.cell,
      path: `/${pathFromRoot}`,
      src: `${origin}/${pathFromRoot}`,
      asset: basename(sourcePath),
    };
  }

  const makeDeck = (nextIndex) => ({
    hand: Array.from({ length: 4 }, (_, slot) => ids[(nextIndex + slot + 1) % ids.length]),
    queue: [
      ids[nextIndex],
      ids[(nextIndex + 5) % ids.length],
      ids[(nextIndex + 6) % ids.length],
      ids[(nextIndex + 7) % ids.length],
    ],
    next: ids[nextIndex],
    sequence: 0,
  });
  const makeMatch = (ended = false) => ({
    crowns: { north: 0, south: 0 },
    destroyedTowerIds: [],
    phase: ended ? "ended" : "regulation",
    result: ended
      ? { crowns: { north: 0, south: 0 }, endedAtTick: 0, kind: "draw", reason: "time", winner: null }
      : null,
    tick: 0,
    towers: HUD_TOWER_IDS.map((id) => ({ hitpoints: 1, id })),
  });
  const makeElixir = (amount) => ({
    tick: 0,
    sides: {
      north: { accumulator: 0, amount },
      south: { accumulator: 0, amount },
    },
  });
  const markupFor = ({ deck, amount = 10, selectedCardId = null, ended = false }) => {
    const cards = [...deck.hand, ...deck.queue].map((id) => cardsById[id]);
    const view = createHudViewModel({
      cards,
      deck,
      elixir: makeElixir(amount),
      localSide: "south",
      match: makeMatch(ended),
      selectedCardId,
    });
    let markup = getHudMarkup(view, { portraits: true });
    const idsInMarkup = [...deck.hand, view.next.id];
    assert.equal(new Set(idsInMarkup).size, idsInMarkup.length,
      "each sampled HUD face has a distinct registry ID");
    const sourceReplacements = new Map();
    for (const id of idsInMarkup) {
      const portrait = getCardPortrait(id);
      const cardMarker = `data-card-id="${id}"`;
      const markerIndex = markup.indexOf(cardMarker);
      assert.notEqual(markerIndex, -1, `${id} has its own projected card node`);
      const cardStart = markup.lastIndexOf('<span class="hud-card"', markerIndex);
      const cardTagEnd = markup.indexOf(">", cardStart);
      const cardTag = markup.slice(cardStart, cardTagEnd + 1);
      assert.ok(cardTag.includes(cardMarker), `${id} card node keeps its registry identity`);
      assert.ok(cardTag.includes(`data-portrait="${portrait.cell === null ? "image" : "atlas"}"`),
        `${id} card node identifies the mapped portrait form`);
      const imageStart = markup.indexOf('<img class="hud-card__portrait-image"', cardTagEnd);
      const nextCardStart = markup.indexOf('<span class="hud-card"', cardTagEnd + 1);
      assert.ok(imageStart > cardTagEnd &&
        (nextCardStart < 0 || imageStart < nextCardStart),
      `${id} portrait element belongs to that card node`);
      const imageTagEnd = markup.indexOf(">", imageStart);
      const imageTag = markup.slice(imageStart, imageTagEnd + 1);
      assert.ok(imageTag.includes(`src="${portrait.src}"`),
        `${id} projected markup uses its getCardPortrait() source`);
      const expectedCell = portrait.cell === null
        ? ""
        : `data-portrait-cell="${portrait.cell}"`;
      assert.equal(imageTag.includes("data-portrait-cell="), portrait.cell !== null,
        `${id} portrait cell metadata matches the canonical mapping`);
      if (expectedCell) assert.ok(imageTag.includes(expectedCell), `${id} selects its mapped atlas cell`);

      const hosted = `${origin}${portraits[id].path}`;
      const priorHosted = sourceReplacements.get(portrait.src);
      assert.ok(priorHosted === undefined || priorHosted === hosted,
        `${id} shared portrait source has one hosted asset path`);
      sourceReplacements.set(portrait.src, hosted);
    }
    for (const [source, hosted] of sourceReplacements) {
      const original = `src="${source}"`;
      assert.ok(markup.includes(original), `projected markup includes original portrait source ${source}`);
      markup = markup.replaceAll(original, `src="${hosted}"`);
    }
    return markup;
  };
  const cases = ids.map((_, nextIndex) => {
    const deck = makeDeck(nextIndex);
    return {
      handIds: deck.hand,
      markup: markupFor({ deck }),
      nextId: deck.next,
    };
  });
  const sampleDeck = makeDeck(0);
  const stateCases = [
    { label: "normal", markup: markupFor({ deck: sampleDeck, amount: 10 }) },
    { label: "selected", markup: markupFor({
      deck: sampleDeck, amount: 10, selectedCardId: sampleDeck.hand[0],
    }) },
    { label: "insufficient", markup: markupFor({ deck: sampleDeck, amount: 0 }) },
    { label: "disabled", markup: markupFor({ deck: sampleDeck, amount: 10, ended: true }) },
    { label: "ended-low-elixir", markup: markupFor({
      deck: sampleDeck, amount: 0, ended: true, selectedCardId: sampleDeck.hand[0],
    }) },
  ];
  return { cases, cardsById, portraits, stateCases };
}

async function ensureHudAssetsReady(frame) {
  const readiness = await frame.evaluate(async () => {
    const fontQuery = '700 22px "Barlow Condensed"';
    const loadedFaces = await document.fonts.load(fontQuery, "Brackenwheel");
    await document.fonts.ready;
    const images = [...document.querySelectorAll(
      '.game-ui-hud-frame .hud-card__portrait-image',
    )];
    await Promise.all(images.map((image) => image.decode()));
    return {
      fontLoaded: document.fonts.check(fontQuery, "Brackenwheel"),
      loadedFaceCount: loadedFaces.length,
      images: images.map((image) => ({
        complete: image.complete,
        currentSrc: image.currentSrc,
        naturalWidth: image.naturalWidth,
      })),
    };
  });
  assert.ok(readiness.fontLoaded && readiness.loadedFaceCount > 0,
    `the bundled Barlow face is ready before measurement: ${JSON.stringify(readiness)}`);
  assert.ok(readiness.images.length > 0 && readiness.images.every(({ complete, naturalWidth }) =>
    complete && naturalWidth > 0),
  `visible original portraits decode before measurement: ${JSON.stringify(readiness.images)}`);
  return readiness;
}

async function inspectHudCases(frame, cases) {
  return frame.evaluate(async (inputCases) => {
    const rect = (node) => {
      const bounds = node.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        height: bounds.height,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        width: bounds.width,
      };
    };
    const words = (name) => {
      const text = name.textContent.trim();
      const textNode = name.firstChild;
      const result = [];
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return result;
      for (const match of text.matchAll(/\S+/gu)) {
        const range = document.createRange();
        range.setStart(textNode, match.index);
        range.setEnd(textNode, match.index + match[0].length);
        result.push({
          text: match[0],
          rectCount: range.getClientRects().length,
          top: range.getBoundingClientRect().top,
          width: range.getBoundingClientRect().width,
        });
      }
      return result;
    };
    const inspectCard = (card, kind) => {
      const name = card.querySelector(".hud-card__name");
      const nameStyle = getComputedStyle(name);
      const cost = card.querySelector(".hud-card__cost");
      const costStyle = getComputedStyle(cost);
      const image = card.querySelector(".hud-card__portrait-image");
      const imageStyle = getComputedStyle(image);
      const cell = card.querySelector(".hud-card__portrait-cell");
      const lines = new Set(words(name).map(({ top }) => Math.round(top * 1_000) / 1_000));
      return {
        cost: rect(cost),
        costBackground: costStyle.backgroundColor,
        costBorder: costStyle.borderColor,
        costColor: costStyle.color,
        costFilter: costStyle.filter,
        costFont: Number.parseFloat(costStyle.fontSize),
        costText: cost.textContent.trim(),
        card: rect(card),
        disabled: card.dataset.disabled ?? null,
        id: card.dataset.cardId,
        image: {
          complete: image.complete,
          currentSrc: image.currentSrc,
          src: image.src,
          naturalHeight: image.naturalHeight,
          naturalWidth: image.naturalWidth,
          cellAttribute: image.getAttribute("data-portrait-cell"),
          cell: rect(cell),
          cellTop: Number.parseFloat(getComputedStyle(cell).top),
          bounds: rect(image),
          left: Number.parseFloat(imageStyle.left),
          top: Number.parseFloat(imageStyle.top),
          width: Number.parseFloat(imageStyle.width),
          height: Number.parseFloat(imageStyle.height),
          objectFit: imageStyle.objectFit,
          filter: imageStyle.filter,
        },
        mark: card.dataset.portrait ?? null,
        name: rect(name),
        nameBackground: nameStyle.backgroundColor,
        nameColor: nameStyle.color,
        nameClientHeight: name.clientHeight,
        nameClientWidth: name.clientWidth,
        nameContentWidth: name.clientWidth -
          Number.parseFloat(nameStyle.paddingLeft) - Number.parseFloat(nameStyle.paddingRight),
        nameFamily: nameStyle.fontFamily,
        nameFont: Number.parseFloat(nameStyle.fontSize),
        nameLineCount: lines.size,
        nameScrollHeight: name.scrollHeight,
        nameScrollWidth: name.scrollWidth,
        nameText: name.textContent.trim(),
        nameWhiteSpace: nameStyle.whiteSpace,
        overflowWrap: nameStyle.overflowWrap,
        wordBreak: nameStyle.wordBreak,
        hyphens: nameStyle.hyphens,
        writingMode: nameStyle.writingMode,
        words: words(name),
        portrait: rect(card.querySelector(".hud-card__portrait")),
        selected: card.dataset.selected ?? null,
        insufficient: card.dataset.insufficient ?? null,
        borderColor: getComputedStyle(card).borderColor,
        borderStyle: getComputedStyle(card).borderStyle,
        boxShadow: getComputedStyle(card).boxShadow,
        kind,
      };
    };
    const probe = document.createElement("div");
    probe.className = "game-ui-hud-frame";
    probe.setAttribute("aria-hidden", "true");
    probe.style.opacity = "0";
    probe.style.pointerEvents = "none";
    document.body.append(probe);
    const result = [];
    try {
      for (const input of inputCases) {
        probe.innerHTML = input.markup;
        const images = [...probe.querySelectorAll(".hud-card__portrait-image")];
        await Promise.all(images.map((image) => image.decode()));
        const hand = [...probe.querySelectorAll('[data-ui="hud-hand"] .hud-card')]
          .map((card) => inspectCard(card, "hand"));
        const nextRoot = probe.querySelector('[data-ui="hud-next"]');
        const next = inspectCard(nextRoot.querySelector(".hud-card"), "next");
        next.label = getComputedStyle(nextRoot, "::after").content;
        result.push({
          elixirAmount: probe.querySelector('[data-ui="hud-elixir"]').dataset.amount,
          phase: probe.querySelector('[data-ui="hud-projection"]').dataset.phase,
          hand,
          handIds: input.handIds ?? null,
          label: input.label ?? null,
          next,
          nextId: input.nextId ?? null,
        });
      }
    } finally {
      probe.remove();
    }
    return result;
  }, cases);
}

function assertReadableHudCard(card, scale, viewport, expectedPortraits, expectedCards) {
  const expected = expectedCards[card.id];
  const portrait = expectedPortraits[card.id];
  assert.ok(expected && portrait, `${card.id} is in the canonical roster and portrait map`);
  assert.equal(card.nameText, expected.displayName, `${card.id} keeps its full original name`);
  assert.equal(card.costText, String(expected.cost), `${card.id} keeps its catalog cost`);
  assert.equal(card.nameFont, 22, `${card.id} uses the 22px frame-space name floor`);
  assert.equal(card.nameFamily.includes("Barlow Condensed"), true,
    `${card.id} uses the self-hosted condensed face: ${card.nameFamily}`);
  assert.equal(card.writingMode, "horizontal-tb", `${card.id} stays horizontal`);
  assert.equal(card.wordBreak, "normal");
  assert.equal(card.overflowWrap, "normal");
  assert.equal(card.hyphens, "manual");
  assert.equal(card.nameWhiteSpace, "normal");
  assert.ok(card.nameContentWidth >= 124,
    `${card.id} has a 124px name measure inside its outer plate`);
  assert.ok(card.nameLineCount <= 2,
    `${card.id} uses at most two whole-word lines: ${JSON.stringify(card.words)}`);
  assert.ok(card.words.length > 0 && card.words.every(({ rectCount, width }) =>
    rectCount === 1 && width <= 118),
  `${card.id} keeps every whole word within 118 frame pixels: ${JSON.stringify(card.words)}`);
  assert.ok(card.nameScrollWidth <= card.nameClientWidth &&
    card.nameScrollHeight <= card.nameClientHeight,
  `${card.id} has no clipped name pixels`);
  assert.ok(card.name.left >= card.card.left && card.name.right <= card.card.right &&
    card.name.top >= card.card.top && card.name.bottom <= card.card.bottom,
  `${card.id} name stays inside the outer name plate`);
  assert.equal(intersects(card.name, card.portrait), false,
    `${card.id} name plate does not overlap its portrait`);
  assert.equal(intersects(card.name, card.cost), false,
    `${card.id} name plate does not overlap its cost`);
  assert.ok(card.cost.left >= card.card.left && card.cost.right <= card.card.right &&
    card.cost.top >= card.card.top && card.cost.bottom <= card.card.bottom,
  `${card.id} cost disc remains inside its outer card`);
  assert.equal(intersects(card.cost, card.portrait), true,
    `${card.id} cost disc sits over the portrait as an intentional layer`);
  assert.ok(card.cost.left >= card.portrait.left && card.cost.right <= card.portrait.right &&
    card.cost.top >= card.portrait.top && card.cost.bottom <= card.portrait.bottom,
  `${card.id} cost disc is contained by the portrait window`);
  assert.equal(card.name.height, 51, `${card.id} has a 51px outer name band`);
  assert.equal(card.portrait.width, 130, `${card.id} has a 130px portrait window`);
  assert.equal(card.portrait.height, card.kind === "next" ? 84 : 104,
    `${card.id} has the intended portrait crop height`);
  assert.equal(card.cost.width, 46, `${card.id} has a 46px cost disc`);
  assert.equal(card.cost.height, 46, `${card.id} has a 46px cost disc`);
  assert.equal(card.costFont, 30, `${card.id} cost stays 30 frame pixels`);
  assert.equal(card.image.complete, true, `${card.id} portrait is complete`);
  assert.ok(card.image.naturalWidth > 0 && card.image.naturalHeight > 0,
    `${card.id} portrait has decoded original pixels`);
  assert.equal(card.image.currentSrc, portrait.src,
    `${card.id} portrait source matches getCardPortrait()`);
  assert.equal(card.mark, portrait.cell === null ? "image" : "atlas");
  assert.equal(card.image.cellAttribute,
    portrait.cell === null ? null : String(portrait.cell));
  assert.equal(card.image.objectFit, portrait.cell === null ? "cover" : "fill");
  if (portrait.cell === null) {
    assert.equal(card.image.width, 130, `${card.id} single image fills the square cell`);
    assert.equal(card.image.height, 130, `${card.id} single image fills the square cell`);
  } else {
    assert.equal(card.image.width, 520, `${card.id} atlas uses four 130px columns`);
    const expectedLeft = -(portrait.cell % 4) * 130;
    const expectedTop = -Math.floor(portrait.cell / 4) * 130;
    assert.ok(card.image.left === expectedLeft,
      `${card.id} selects the exact horizontal atlas cell: ${card.image.left} !== ${expectedLeft}`);
    assert.ok(card.image.top === expectedTop,
      `${card.id} selects the exact vertical atlas cell: ${card.image.top} !== ${expectedTop}`);
    assert.equal(card.image.height, 260, `${card.id} atlas preserves its 4×2 cell ratio`);
  }
  const nameFloor = viewport.width === 1280 ? 10 : 11;
  assert.ok(card.nameFont * scale >= nameFloor,
    `${card.id} name reaches ${nameFloor} physical pixels: ${card.nameFont * scale}`);
  assert.ok(card.costFont * scale >= 12,
    `${card.id} cost reaches 12 physical pixels: ${card.costFont * scale}`);
}

async function measureHud(page, viewport, expectedPortraits, expectedCards) {
  const frame = page.locator(".battle-frame");
  const frameRect = await frame.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { height: rect.height, left: rect.left, top: rect.top, width: rect.width };
  });
  const scale = frameRect.width / 720;
  const expectedScale = HUD_FRAME_SCALES[`${viewport.width}x${viewport.height}`];
  assert.ok(expectedScale, `a pinned HUD scale exists for ${viewport.width}x${viewport.height}`);
  assert.equal(scale, expectedScale, `${viewport.width}x${viewport.height} uses its exact k/64 frame scale`);
  assert.equal(frameRect.height, 1_280 * expectedScale,
    `${viewport.width}x${viewport.height} preserves the complete 720x1280 input frame`);
  const postedScale = await page.frameLocator(".battle-frame").locator("body")
    .evaluate(() => Number(document.documentElement.dataset.combatFrameScale));
  assert.equal(postedScale, expectedScale,
    "parent transform and posted combat scale use the same exact value");
  for (const coordinate of [frameRect.left, frameRect.top]) {
    assert.ok(Math.abs(coordinate / scale - Math.round(coordinate / scale)) < 2 ** -20,
      `frame page origin ${coordinate} lies on a multiple of ${scale}`);
  }
  const view = await page.frameLocator(".battle-frame").locator("body").evaluate(async (body) => {
    const { arenaHudController } = await import("/src/ui/arena-shell-entry.js");
    const sessionState = arenaHudController.session.state;
    const localSide = "south";
    const elixirState = sessionState.elixir;
    const projection = body.querySelector('[data-ui="hud-projection"]');
    const rect = (node) => {
      const bounds = node.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        height: bounds.height,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        width: bounds.width,
      };
    };
    const wordEvidence = (name) => {
      const text = name.textContent.trim();
      const textNode = name.firstChild;
      const result = [];
      if (!textNode || textNode.nodeType !== Node.TEXT_NODE) return result;
      for (const match of text.matchAll(/\S+/gu)) {
        const range = document.createRange();
        range.setStart(textNode, match.index);
        range.setEnd(textNode, match.index + match[0].length);
        result.push({
          text: match[0],
          rectCount: range.getClientRects().length,
          top: range.getBoundingClientRect().top,
          width: range.getBoundingClientRect().width,
        });
      }
      return result;
    };
    const inspectCard = (card, kind) => {
      const name = card.querySelector(".hud-card__name");
      const nameStyle = getComputedStyle(name);
      const cost = card.querySelector(".hud-card__cost");
      const costStyle = getComputedStyle(cost);
      const image = card.querySelector(".hud-card__portrait-image");
      const imageStyle = getComputedStyle(image);
      const cell = card.querySelector(".hud-card__portrait-cell");
      const measuredWords = wordEvidence(name);
      const lineTops = new Set(measuredWords.map(({ top }) => Math.round(top * 1_000) / 1_000));
      return {
        card: rect(card),
        cost: rect(cost),
        costFont: Number.parseFloat(costStyle.fontSize),
        costText: cost.textContent.trim(),
        id: card.dataset.cardId,
        image: {
          complete: image.complete,
          currentSrc: image.currentSrc,
          src: image.src,
          naturalHeight: image.naturalHeight,
          naturalWidth: image.naturalWidth,
          cellAttribute: image.getAttribute("data-portrait-cell"),
          cell: rect(cell),
          cellTop: Number.parseFloat(getComputedStyle(cell).top),
          bounds: rect(image),
          left: Number.parseFloat(imageStyle.left),
          top: Number.parseFloat(imageStyle.top),
          width: Number.parseFloat(imageStyle.width),
          height: Number.parseFloat(imageStyle.height),
          objectFit: imageStyle.objectFit,
          filter: imageStyle.filter,
        },
        mark: card.dataset.portrait ?? null,
        name: rect(name),
        nameClientHeight: name.clientHeight,
        nameClientWidth: name.clientWidth,
        nameContentWidth: name.clientWidth - Number.parseFloat(nameStyle.paddingLeft) -
          Number.parseFloat(nameStyle.paddingRight),
        nameFamily: nameStyle.fontFamily,
        nameFont: Number.parseFloat(nameStyle.fontSize),
        nameLineCount: lineTops.size,
        nameScrollHeight: name.scrollHeight,
        nameScrollWidth: name.scrollWidth,
        nameText: name.textContent.trim(),
        nameBackground: nameStyle.backgroundColor,
        nameWhiteSpace: nameStyle.whiteSpace,
        overflowWrap: nameStyle.overflowWrap,
        wordBreak: nameStyle.wordBreak,
        hyphens: nameStyle.hyphens,
        writingMode: nameStyle.writingMode,
        words: measuredWords,
        portrait: rect(card.querySelector(".hud-card__portrait")),
        target: null,
        costBackground: costStyle.backgroundColor,
        costBorder: costStyle.borderColor,
        borderColor: getComputedStyle(card).borderColor,
        borderStyle: getComputedStyle(card).borderStyle,
        boxShadow: getComputedStyle(card).boxShadow,
        selected: card.dataset.selected ?? null,
        insufficient: card.dataset.insufficient ?? null,
        disabled: card.dataset.disabled ?? null,
        kind,
      };
    };
    const slots = [...body.querySelectorAll('[data-ui="card-slot"]')];
    const projectedCards = [...body.querySelectorAll('[data-ui="hud-hand"] .hud-card')];
    const cards = slots.map((slot, index) => {
      const card = inspectCard(projectedCards[index], "hand");
      card.target = rect(slot);
      return card;
    });
    const next = body.querySelector('[data-ui="hud-next"]');
    const nextTarget = body.querySelector('[data-ui="next-card"]');
    const nextCard = inspectCard(next.querySelector(".hud-card"), "next");
    nextCard.target = rect(nextTarget);
    nextCard.label = getComputedStyle(next, "::after").content;
    const shell = body.querySelector(".battle-shell");
    const arena = body.querySelector('[data-ui="arena"]');
    const hudElements = [...body.querySelectorAll([
      '[data-ui^="hud-"]',
      ".hand-tray",
      ".elixir-rail",
      ".next-card",
      ".card-slot",
      ".hud-card",
      ".hud-card__name",
      ".hud-card__cost",
    ].join(","))].map((node) => ({
      label: node.dataset.ui ?? node.className,
      ...rect(node),
    }));
    const output = body.querySelector(".elixir-rail output");
    return {
      appFrame: body.dataset.appFrame ?? null,
      arena: rect(arena),
      cards,
      frame: { width: body.clientWidth, height: body.clientHeight },
      hudElements,
      next: nextCard,
      elixir: rect(body.querySelector('[data-ui="hud-elixir"]')),
      amount: body.querySelector('[data-ui="hud-elixir"]').dataset.amount,
      localSide,
      modelAmount: elixirState.sides[localSide].amount,
      sessionTick: sessionState.tick,
      elixirTick: elixirState.tick,
      projectionTick: Number(projection.dataset.tick),
      elixirOutputDisplay: getComputedStyle(output).display,
      shell: rect(shell),
      shellPlayfield: {
        height: Number.parseFloat(getComputedStyle(shell).getPropertyValue("--arena-height")),
        left: Number.parseFloat(getComputedStyle(shell).getPropertyValue("--arena-left")),
        top: Number.parseFloat(getComputedStyle(shell).getPropertyValue("--arena-top")),
        width: Number.parseFloat(getComputedStyle(shell).getPropertyValue("--arena-width")),
      },
    };
  });

  assert.equal(view.appFrame, "true", `${viewport.width}x${viewport.height} opts into app HUD sizing`);
  assert.deepEqual(view.shellPlayfield, { left: 90, top: 108, width: 540, height: 960 },
    "app HUD sizing leaves the authored playfield coordinates unchanged");
  assert.equal(view.cards.length, 4, "four dynamic cards remain aligned with four input regions");
  assert.deepEqual(view.arena, { left: 86, top: 104, right: 634, bottom: 1072, width: 548, height: 968 },
    "app HUD sizing leaves the rendered arena box unchanged");
  assert.equal(intersects(view.cards[3].card, view.elixir), false,
    "the elixir amount stays clear of the last card portrait and name");
  assert.ok(view.hudElements.length > 0);
  for (const element of view.hudElements) {
    assert.ok(element.left >= 0 && element.top >= 0 &&
      element.right <= view.frame.width && element.bottom <= view.frame.height,
    `${element.label} stays inside the packaged game frame at ${viewport.width}x${viewport.height}: ${JSON.stringify({
      bounds: element,
      frame: view.frame,
    })}`);
  }
  assert.equal(view.elixirOutputDisplay, "none",
    "app-frame resource amount has one visible badge next to the rail");
  assert.equal(view.elixirTick, view.sessionTick,
    "the authoritative session elixir model belongs to the captured session tick");
  assert.equal(view.projectionTick, view.sessionTick,
    "the rendered HUD projection belongs to the captured session tick");
  assert.equal(view.amount, String(view.modelAmount),
    "the visible resource badge matches the authoritative session side amount");
  assert.ok(view.elixir.left >= 2 && view.elixir.top >= 2 &&
    view.elixir.right + 2 <= view.frame.width &&
    view.elixir.bottom + 4 <= view.frame.height,
  `the elixir border and shadows stay inside the game frame: ${JSON.stringify({
    elixir: view.elixir,
    frame: view.frame,
  })}`);
  assert.equal(view.next.label, '"NEXT"', "the fifth card is visibly labeled as the next draw");
  assert.notEqual(view.next.id, null);
  assert.equal(new Set([...view.cards.map(({ id }) => id), view.next.id]).size, 5,
    "the hand and next preview show five distinct cards from one cycle");
  assert.deepEqual(view.cards.map(({ target }) => target.left), [149, 291, 433, 575]);
  assert.deepEqual(view.cards.map(({ target }) => target.width), [136, 136, 136, 136]);
  assert.deepEqual(view.cards.map(({ target }) => target.height), [162, 162, 162, 162]);
  assert.deepEqual([view.next.target.left, view.next.target.top,
    view.next.target.width, view.next.target.height], [7, 1076, 136, 162]);

  for (const card of [...view.cards, view.next]) {
    assert.ok(Math.abs(card.card.left - card.target.left) <= 0.5 &&
      Math.abs(card.card.top - card.target.top) <= 0.5 &&
      Math.abs(card.card.width - card.target.width) <= 0.5 &&
      Math.abs(card.card.height - card.target.height) <= 0.5,
    `${card.nameText} face stays aligned with its static input region: ${JSON.stringify({ face: card.card, target: card.target })}`);
    assert.ok(card.target.width * scale >= 44 && card.target.height * scale >= 44,
      `${card.nameText} target clears 44×44 physical pixels: ${JSON.stringify({
        width: card.target.width * scale,
        height: card.target.height * scale,
        scale,
      })}`);
    assertReadableHudCard(card, scale, viewport, expectedPortraits, expectedCards);
    assert.equal(card.image.currentSrc, card.image.src,
      `${card.nameText} resolves the source selected by getCardPortrait()`);
  }
  const stonehauler = [...view.cards, view.next].find(({ id }) => id === "stonehauler");
  assert.ok(stonehauler.image.naturalWidth > 0 && stonehauler.image.naturalHeight > 0,
    "Stonehauler keeps decoded original painted portrait pixels in the packaged hand");

  const hitTargets = await page.frameLocator(".battle-frame")
    .locator('[data-ui="card-slot"]')
    .evaluateAll((nodes) => nodes.map((node) => {
      const bounds = node.getBoundingClientRect();
      const hit = document.elementFromPoint(bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2);
      return hit === node || node.contains(hit);
    }));
  assert.deepEqual(hitTargets, [true, true, true, true],
    "all four selection regions receive center-point pointer hits");
  return { ...view, scale, viewport };
}

async function captureHudFailureEvidence(page, standalone, error, pageErrors) {
  const screenshots = {};
  const screenshotErrors = {};
  const capture = async (name, path, action) => {
    try {
      await action();
      screenshots[name] = path;
    } catch (captureError) {
      screenshotErrors[name] = String(captureError);
    }
  };
  if (!page.isClosed()) {
    const pagePath = join(ARTIFACTS, "failure-page.png");
    await capture("page", pagePath, () => page.screenshot({ path: pagePath, fullPage: true }));
    const framePath = join(ARTIFACTS, "failure-battle-frame.png");
    await capture("battleFrame", framePath, () =>
      page.locator(".battle-frame").screenshot({ path: framePath }));
  }
  if (standalone !== null && !standalone.isClosed()) {
    const standalonePath = join(ARTIFACTS, "failure-standalone.png");
    await capture("standalone", standalonePath, () =>
      standalone.screenshot({ path: standalonePath, fullPage: true }));
  }

  const parentState = await page.evaluate(() => {
    const frame = document.querySelector(".battle-frame");
    const bounds = frame?.getBoundingClientRect();
    return {
      activeView: document.querySelector(".app-shell")?.dataset.viewActive ?? null,
      frame: bounds ? {
        height: bounds.height,
        left: bounds.left,
        top: bounds.top,
        width: bounds.width,
      } : null,
      viewport: { width: innerWidth, height: innerHeight },
    };
  }).catch((stateError) => ({ captureError: String(stateError) }));
  const child = page.frames().find((frame) => frame.url().includes("app-frame=1"));
  const battleState = child === undefined ? null : await child.evaluate(async () => {
    const { arenaHudController } = await import("/src/ui/arena-shell-entry.js");
    const sessionState = arenaHudController.session.state;
    const projection = document.querySelector('[data-ui="hud-projection"]');
    return {
      appFrame: document.body.dataset.appFrame ?? null,
      hudAmount: document.querySelector('[data-ui="hud-elixir"]')?.dataset.amount ?? null,
      projectionTick: projection ? Number(projection.dataset.tick) : null,
      sessionTick: sessionState.tick,
      elixirTick: sessionState.elixir.tick,
      southElixir: sessionState.elixir.sides.south,
      selectedCardId: arenaHudController.input?.selectedCardId ?? null,
      status: arenaHudController.status,
      replayLength: arenaHudController.session.replay.length,
    };
  }).catch((stateError) => ({ captureError: String(stateError) }));

  writeFileSync(join(ARTIFACTS, "failure-evidence.json"), `${JSON.stringify({
    error: String(error?.stack ?? error),
    pageErrors,
    parentState,
    battleState,
    screenshots,
    screenshotErrors,
  }, null, 2)}\n`);
}

test("packaged battle hand stays readable, selectable, and cycle-accurate", {
  timeout: 180_000,
}, async (t) => {
  mkdirSync(ARTIFACTS, { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), "battle-hand-polish-release-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const releaseRoot = join(temporary, "release");
  await buildRelease({ output: releaseRoot });
  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
    `--root=${releaseRoot}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => {
    server.kill("SIGTERM");
    await once(server, "exit").catch(() => {});
  });
  const address = await serverAddress(server.stdout);
  const releaseOrigin = `http://${address.host}:${address.port}`;
  const probeData = createHudProbeData(releaseOrigin);
  const portraitAssetStems = new Set(Object.values(probeData.portraits)
    .map(({ asset }) => asset.replace(/\.webp$/u, "")));
  const { chromium } = await import(PLAYWRIGHT);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  page.setDefaultTimeout(7_000);
  page.setDefaultNavigationTimeout(15_000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  const layouts = [];
  let standalone = null;

  try {
  await page.goto(`http://${address.host}:${address.port}/public/index.html`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator('.app-nav [data-nav-to="deck"]').click();
  await page.mouse.move(30, 420);
  await page.mouse.wheel(0, 480);
  await safePageTarget(page, '[data-replace-slot="7"]');
  const stonehaulerChoice = page.locator('[data-replacement-card-id="stonehauler"]');
  await stonehaulerChoice.waitFor({ state: "visible" });
  await safePageTarget(page, '[data-replacement-card-id="stonehauler"]');
  assert.match(await page.locator("[data-deck-status]").innerText(),
    /Stonehauler replaced Cinderlings/u,
  "the custom deck editor still admits the longest supported card name");
  await page.locator('.app-nav [data-nav-to="battle"]').click();
  const frame = page.locator(".battle-frame");
  await frame.waitFor({ state: "visible" });
  const battle = page.frameLocator(".battle-frame");
  await battle.locator('[data-ui="hud-next"] .hud-card').waitFor({ state: "visible" });
  const childFrame = page.frames().find((candidate) => candidate.url().includes("app-frame=1"));
  assert.ok(childFrame, "packaged app mounts its real battle iframe");
  await page.waitForFunction(() => {
    const body = document.querySelector(".battle-frame")?.contentDocument?.body;
    return body?.dataset.appFrame === "true";
  });
  await battle.locator('[data-ui="hud-next"] [data-card-id="stonehauler"], [data-ui="hud-hand"] [data-card-id="stonehauler"]')
    .first().waitFor({ state: "visible", timeout: 10_000 });
  const hudReadiness = await ensureHudAssetsReady(childFrame);
  const allRosterEvidence = [];
  let appearanceEvidence = null;

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 720, height: 1280 },
    { width: 1440, height: 933 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(() => {
      const frameNode = document.querySelector(".battle-frame");
      const rect = frameNode?.getBoundingClientRect();
      return rect && rect.width > 0 && rect.height > 0;
    });
    await page.waitForTimeout(50);
    const layout = await measureHud(page, viewport, probeData.portraits, probeData.cardsById);
    layouts.push(layout);
    const rosterSamples = await inspectHudCases(childFrame, probeData.cases);
    const expectedIds = Object.keys(probeData.cardsById).toSorted();
    assert.equal(rosterSamples.length, expectedIds.length,
      `${viewport.width}x${viewport.height} measures every playable identity`);
    const handAppearances = Object.fromEntries(expectedIds.map((id) => [id, 0]));
    for (const [index, sample] of rosterSamples.entries()) {
      assert.deepEqual(sample.handIds, probeData.cases[index].handIds);
      assert.equal(sample.nextId, probeData.cases[index].nextId);
      for (const card of sample.hand) {
        assertReadableHudCard(card, HUD_FRAME_SCALES[`${viewport.width}x${viewport.height}`],
          viewport, probeData.portraits, probeData.cardsById);
        handAppearances[card.id] += 1;
      }
      assertReadableHudCard(sample.next,
        HUD_FRAME_SCALES[`${viewport.width}x${viewport.height}`],
        viewport, probeData.portraits, probeData.cardsById);
    }
    assert.deepEqual(Object.keys(handAppearances).toSorted(), expectedIds);
    assert.ok(Object.values(handAppearances).every((count) => count === 4),
      `${viewport.width}x${viewport.height} samples every identity in four hand positions: ${JSON.stringify(handAppearances)}`);
    assert.deepEqual(rosterSamples.map(({ nextId }) => nextId).toSorted(), expectedIds,
      `${viewport.width}x${viewport.height} samples every identity as Next`);
    allRosterEvidence.push({
      viewport,
      handSamples: rosterSamples.reduce((total, sample) => total + sample.hand.length, 0),
      handAppearances,
      nextSamples: rosterSamples.length,
      cardIds: expectedIds,
    });

    const states = await inspectHudCases(childFrame, probeData.stateCases);
    assert.equal(states.length, 5);
    const [normal, selected, insufficient, disabled, endedLowElixir] = states;
    assert.deepEqual(states.map(({ label }) => label),
      ["normal", "selected", "insufficient", "disabled", "ended-low-elixir"]);
    assert.deepEqual(states.map(({ elixirAmount }) => elixirAmount), ["10", "10", "0", "10", "0"]);
    assert.deepEqual(states.map(({ phase }) => phase),
      ["regulation", "regulation", "regulation", "ended", "ended"]);
    assert.equal(normal.hand[0].selected, "false");
    assert.equal(normal.hand[0].insufficient, "false");
    assert.equal(normal.hand[0].image.filter, "none");
    assert.equal(selected.hand[0].selected, "true");
    assert.equal(selected.hand[0].borderColor, "rgb(233, 168, 58)");
    assert.equal(selected.hand[0].nameBackground, "rgb(233, 168, 58)");
    const lowElixirCards = insufficient.hand.filter((card) => card.insufficient === "true");
    assert.ok(lowElixirCards.length > 0, "the live amount-zero hand includes unaffordable cards");
    for (const card of lowElixirCards) {
      assert.equal(card.borderStyle, "dashed");
      assert.equal(card.image.filter, "grayscale(0.6) brightness(0.55)");
      assert.equal(card.costBackground, "rgb(25, 29, 34)");
      assert.equal(card.costBorder, "rgb(180, 85, 196)");
      assert.equal(card.costColor, "rgb(242, 169, 237)");
      assert.equal(card.costFilter, "none");
    }
    assert.equal(disabled.hand[0].disabled, "true");
    assert.match(disabled.hand[0].image.filter, /grayscale/u);
    assert.equal(disabled.hand[0].nameBackground, "rgb(139, 133, 120)");
    assert.ok(endedLowElixir.hand.some((card) => card.insufficient === "true"),
      "the ended amount-zero state includes cards that are also insufficient");
    assert.equal(endedLowElixir.hand[0].selected, "true",
      "the ended low-wallet probe retains a selected card to check ended-state precedence");
    for (const state of [disabled, endedLowElixir]) {
      assert.ok(state.hand.every((card) => card.disabled === "true"));
      for (const card of state.hand) {
        assert.equal(card.borderStyle, "solid");
        assert.equal(card.borderColor, "rgb(93, 100, 104)");
        assert.equal(card.boxShadow, "none");
        assert.equal(card.image.filter, "grayscale(1) brightness(0.6)");
        assert.equal(card.costBackground, "rgb(93, 100, 104)");
        assert.equal(card.costBorder, "rgb(25, 29, 34)");
        assert.equal(card.costColor, "rgb(244, 235, 214)");
        assert.equal(card.costFilter, "none");
        assert.equal(card.nameBackground, "rgb(139, 133, 120)");
        assert.equal(card.nameColor, "rgb(244, 235, 214)");
      }
    }
    assert.match(normal.next.image.filter, /saturate/u,
      "Next portrait is visually distinguished while its full name stays normal");
    assert.equal(normal.next.label, '"NEXT"');
    appearanceEvidence = {
      viewport,
      states: states.map(({ label, elixirAmount, phase, hand, next }) => ({
        label,
        elixirAmount,
        phase,
        hand: hand.map(({ id, selected: isSelected, insufficient: isInsufficient,
          disabled: isDisabled, borderStyle, borderColor, boxShadow,
          nameBackground, nameColor, costBackground, costBorder, costColor,
          costFilter, image }) => ({
          id,
          selected: isSelected,
          insufficient: isInsufficient,
          disabled: isDisabled,
          borderStyle,
          borderColor,
          boxShadow,
          nameBackground,
          nameColor,
          costBackground,
          costBorder,
          costColor,
          costFilter,
          filter: image.filter,
        })),
        nextId: next.id,
      })),
    };
    await page.screenshot({ path: join(ARTIFACTS, `after-${viewport.width}x${viewport.height}.png`) });
    await frame.screenshot({ path: join(ARTIFACTS, `after-hud-${viewport.width}x${viewport.height}.png`) });
  }

  const currentHand = async () => battle.locator('[data-ui="hud-hand"] .hud-card')
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.cardId));
  const handBefore = await currentHand();
  const nextBefore = await battle.locator('[data-ui="hud-next"] .hud-card').getAttribute("data-card-id");
  const firstSlot = battle.locator('[data-ui="card-slot"]').first();
  const firstCard = battle.locator('[data-ui="hud-hand"] .hud-card').first();
  const firstId = await firstSlot.getAttribute("data-card-id");
  await battle.locator('[data-ui="elixir-rail"]').waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const slot = document.querySelector(".battle-frame")?.contentDocument
      ?.querySelector('[data-ui="hud-hand"] .hud-card');
    return slot?.dataset.insufficient === "false";
  });
  await firstSlot.evaluate((node) => node.addEventListener("click", (event) => {
    node.dataset.app004TrustedSelection = String(event.isTrusted);
  }, { once: true }));
  await firstSlot.click();
  assert.equal(await firstSlot.getAttribute("data-app004-trusted-selection"), "true",
    "first slot selection comes from a trusted browser pointer click");
  await page.waitForFunction(() => document.querySelector(".battle-frame")?.contentDocument
    ?.querySelector('[data-ui="hud-hand"] .hud-card')?.dataset.selected === "true");
  const selectedPaint = await firstCard.evaluate((node) => ({
    borderColor: getComputedStyle(node).borderColor,
    nameBackground: getComputedStyle(node.querySelector(".hud-card__name")).backgroundColor,
  }));
  assert.deepEqual(selectedPaint, {
    borderColor: "rgb(233, 168, 58)",
    nameBackground: "rgb(233, 168, 58)",
  }, "a trusted first-slot selection gets the selected paint");
  await firstSlot.click();
  await page.waitForFunction(() => document.querySelector(".battle-frame")?.contentDocument
    ?.querySelector('[data-ui="hud-hand"] .hud-card')?.dataset.selected === "false");
  const restoredPaint = await firstCard.evaluate((node) => ({
    borderColor: getComputedStyle(node).borderColor,
    nameBackground: getComputedStyle(node.querySelector(".hud-card__name")).backgroundColor,
  }));
  assert.deepEqual(restoredPaint, {
    borderColor: "rgb(25, 29, 34)",
    nameBackground: "rgb(244, 235, 214)",
  }, "cancelling the selection restores the normal card paint");
  await firstSlot.click();
  await page.waitForFunction(() => document.querySelector(".battle-frame")?.contentDocument
    ?.querySelector('[data-ui="hud-hand"] .hud-card')?.dataset.selected === "true");
  const arena = battle.locator('[data-ui="arena"]');
  await arena.evaluate((node) => node.addEventListener("pointerup", (event) => {
    node.dataset.app004TrustedDeploy = String(event.isTrusted);
    node.dataset.app004Pointer = JSON.stringify({
      clientX: event.clientX,
      clientY: event.clientY,
      target: event.target?.getAttribute?.("data-ui") ?? event.target?.className ?? null,
    });
  }, { once: true }));
  const arenaBox = await arena.boundingBox();
  assert.ok(arenaBox, "the scaled arena remains an addressable physical target");
  await page.mouse.click(arenaBox.x + arenaBox.width / 2,
    arenaBox.y + arenaBox.height * 0.79);
  let firstDeployment = null;
  for (let attempt = 0; attempt < 60 && firstDeployment === null; attempt += 1) {
    firstDeployment = await cardFrameDeployment(childFrame, firstId);
    if (firstDeployment === null) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(firstDeployment,
    `trusted pointer deploys the first selected card: ${JSON.stringify(await cardFrameDiagnostics(childFrame))}`);
  assert.equal(firstDeployment.deployment.cardId, firstId);
  assert.ok(firstDeployment.deployment.point.y < 15_000,
    "the first deployment receipt is on the legal south side");
  assert.equal(await arena.getAttribute("data-app004-trusted-deploy"), "true",
    "legal south-side deployment comes from a trusted pointer event");
  const handAfterFirst = await currentHand();
  const nextAfterFirst = await battle.locator('[data-ui="hud-next"] .hud-card')
    .getAttribute("data-card-id");
  assert.deepEqual(handAfterFirst, [nextBefore, ...handBefore.slice(1)],
    "playing the first card replaces its selected slot with the next draw");
  assert.notEqual(nextAfterFirst, nextBefore, "the next-card preview advances after deployment");

  const lastSlot = battle.locator('[data-ui="card-slot"]').nth(3);
  const lastId = await lastSlot.getAttribute("data-card-id");
  await page.waitForFunction(() => document.querySelector(".battle-frame")?.contentDocument
    ?.querySelectorAll('[data-ui="hud-hand"] .hud-card')[3]?.dataset.insufficient === "false",
  { timeout: 20_000 });
  await lastSlot.evaluate((node) => node.addEventListener("click", (event) => {
    node.dataset.app004TrustedSelection = String(event.isTrusted);
  }, { once: true }));
  await lastSlot.click();
  assert.equal(await lastSlot.getAttribute("data-app004-trusted-selection"), "true",
    "last slot selection comes from a trusted browser pointer click");
  await page.waitForFunction(() => document.querySelector(".battle-frame")?.contentDocument
    ?.querySelectorAll('[data-ui="hud-hand"] .hud-card')[3]?.dataset.selected === "true");
  await arena.evaluate((node) => node.addEventListener("pointerup", (event) => {
    node.dataset.app004TrustedDeploy = String(event.isTrusted);
  }, { once: true }));
  const lastArenaBox = await arena.boundingBox();
  assert.ok(lastArenaBox);
  await page.mouse.click(lastArenaBox.x + lastArenaBox.width / 2,
    lastArenaBox.y + lastArenaBox.height * 0.79);
  let lastDeployment = null;
  for (let attempt = 0; attempt < 60 && lastDeployment === null; attempt += 1) {
    lastDeployment = await cardFrameDeployment(childFrame, lastId);
    if (lastDeployment === null) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(lastDeployment,
    `trusted pointer deploys the last selected card: ${JSON.stringify(await cardFrameDiagnostics(childFrame))}`);
  assert.equal(lastDeployment.deployment.cardId, lastId);
  assert.ok(lastDeployment.deployment.point.y < 15_000,
    "the last deployment receipt is on the legal south side");
  assert.equal(await arena.getAttribute("data-app004-trusted-deploy"), "true",
    "last-slot legal deployment comes from a trusted browser pointer event");
  const handAfterLast = await currentHand();
  const nextAfterLast = await battle.locator('[data-ui="hud-next"] .hud-card')
    .getAttribute("data-card-id");
  assert.deepEqual(handAfterLast.slice(0, 3), handAfterFirst.slice(0, 3),
    "playing the last card leaves the first three slots aligned");
  assert.equal(handAfterLast[3], nextAfterFirst,
    "the next preview rotates into the selected last slot");
  assert.notEqual(nextAfterLast, nextAfterFirst,
    "the next-card preview advances after the last-slot deployment too");

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotion = await battle.locator("body").evaluate((body) =>
    [body.querySelector(".hand-tray"), ...body.querySelectorAll(".hud-card, .hud-card__name, .hud-card__cost, [data-ui=\"hud-next\"]")]
      .map((node) => ({
        animationName: getComputedStyle(node).animationName,
        transitionDuration: getComputedStyle(node).transitionDuration,
      })));
  assert.ok(reducedMotion.every(({ animationName, transitionDuration }) =>
    animationName === "none" && transitionDuration.split(",").every((duration) =>
      Number.parseFloat(duration) <= 0.0001)),
  `HUD polish adds no reduced-motion animation: ${JSON.stringify(reducedMotion)}`);

  standalone = await browser.newPage({
    viewport: { width: 720, height: 1280 },
    deviceScaleFactor: 1,
  });
  standalone.setDefaultTimeout(7_000);
  standalone.setDefaultNavigationTimeout(15_000);
  const standaloneAssetRequests = [];
  standalone.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.endsWith(".ttf") || [...portraitAssetStems].some((stem) =>
      pathname.includes(stem))) {
      standaloneAssetRequests.push(pathname);
    }
  });
  await standalone.goto(`http://${address.host}:${address.port}/public/ui-arena-shell.html?session-profile=live-seed-2-terminal`, {
    waitUntil: "domcontentloaded",
  });
  await standalone.locator(".battle-shell").waitFor({ state: "visible" });
  await standalone.locator('[data-ui="hud-hand"] .hud-card').first()
    .waitFor({ state: "visible" });
  const standaloneView = await standalone.locator("body").evaluate((body) => {
    const shell = body.querySelector(".battle-shell");
    const tray = body.querySelector(".hand-tray");
    const slots = [...body.querySelectorAll('[data-ui="card-slot"]')];
    const card = body.querySelector('[data-ui="hud-hand"] .hud-card');
    const name = card.querySelector(".hud-card__name");
    const cost = card.querySelector(".hud-card__cost");
    const arena = body.querySelector('[data-ui="arena"]');
    const bounds = (node) => {
      const rect = node.getBoundingClientRect();
      return { height: rect.height, left: rect.left, top: rect.top, width: rect.width };
    };
    return {
      appFrame: body.dataset.appFrame ?? null,
      arena: bounds(arena),
      costFont: getComputedStyle(cost).fontSize,
      hand: slots.map(bounds),
      nameFont: getComputedStyle(name).fontSize,
      portraitImages: body.querySelectorAll(".hud-card__portrait-image").length,
      shell: bounds(shell),
      tray: bounds(tray),
    };
  });
  assert.equal(standaloneView.appFrame, null, "direct arena has no app-frame sizing marker");
  assert.deepEqual(standaloneView.shell, { left: 0, top: 0, width: 720, height: 1280 });
  assert.deepEqual(standaloneView.arena, { left: 86, top: 104, width: 548, height: 968 });
  assert.deepEqual(standaloneView.tray, { left: 112, top: 1154, width: 496, height: 88 },
    "standalone hand tray keeps its original presentation geometry");
  assert.ok(standaloneView.hand.every(({ width, height }) => width === 88 && height === 72),
    "standalone selection slots retain their original size");
  assert.equal(standaloneView.nameFont, "10px");
  assert.equal(standaloneView.costFont, "15px");
  await standalone.screenshot({ path: join(ARTIFACTS, "standalone-720x1280.png") });
  assert.equal(standaloneView.portraitImages, 0,
    "standalone direct arena markup contains no projected portrait elements");
  assert.deepEqual(standaloneAssetRequests, [],
    "standalone direct arena makes no portrait or Barlow font requests");

  assert.deepEqual(pageErrors, [], "packaged app and arena run without browser exceptions");
  writeFileSync(join(ARTIFACTS, "browser-evidence.json"), `${JSON.stringify({
    customDeck: { replaced: "Cinderlings", with: "Stonehauler", slot: 7 },
    viewports: layouts,
    roster: allRosterEvidence,
    appearance: appearanceEvidence,
    hudReadiness,
    selectionAndCycle: {
      initialHand: handBefore,
      initialNext: nextBefore,
      afterFirstDeploy: { hand: handAfterFirst, next: nextAfterFirst },
      afterLastDeploy: { hand: handAfterLast, next: nextAfterLast },
      firstAndLastTrustedSelection: true,
      bothLegalDeploymentsTrusted: true,
    },
    reducedMotion,
    standalone: standaloneView,
    standaloneAssetRequests,
    browserErrors: pageErrors,
    result: "passed",
  }, null, 2)}\n`);

  await standalone.close();
  await page.close();
  } catch (error) {
    await captureHudFailureEvidence(page, standalone, error, pageErrors).catch(() => {});
    throw error;
  }
});
