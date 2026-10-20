import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import test from "node:test";

import { cropPngOnBlankPage } from "./helpers/png-crop.js";

import { projectSessionNonUnitBattleCard } from "../src/content/session-card-catalog.js";
import { GameSession } from "../src/sim/game-session.js";
import { createShippedGameSessionSetup } from "../src/ui/game-browser-entry.js";

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS = process.env.GAME_BROWSER_BUILDING_CHOICE_ARTIFACTS ??
  new URL("../artifacts/game-001huib-round-2/", import.meta.url).pathname;

async function line(stream) {
  let value = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) {
    value += chunk;
    const end = value.indexOf("\n");
    if (end >= 0) return value.slice(0, end);
  }
  throw new Error("building-choice server exited before readiness");
}

async function click(page, selector, offset = null) {
  const box = await page.locator(selector).first().boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, `${selector} must be visible`);
  await page.mouse.click(box.x + (offset?.x ?? box.width / 2),
    box.y + (offset?.y ?? box.height / 2));
}

async function settleBrowserPaint(page) {
  await page.evaluate(() => new Promise((resolve) => {
    window.__nativePaintFrame(() => window.__nativePaintFrame(resolve));
  }));
}

async function renderedState(page) {
  return page.evaluate(() => {
    const controller = globalThis.__bulwarkChoiceController;
    const slots = [...document.querySelectorAll('[data-ui="card-slot"]')]
      .map((node) => node.dataset.cardId);
    const hand = [...document.querySelectorAll('[data-ui="hud-hand"] .hud-card')]
      .map((node) => ({
        cost: Number(node.querySelector(".hud-card__cost").textContent),
        id: node.dataset.cardId,
        name: node.querySelector(".hud-card__name").textContent,
        selected: node.dataset.selected ?? null,
      }));
    const layer = (name) => document.querySelector(
      `[data-game-browser-layer="${name}"]`,
    )?.innerHTML ?? null;
    const targetLinks = [...document.querySelectorAll(
      '.combat-target-link[data-from-structure="true"]',
    )].map((node) => ({
      display: getComputedStyle(node).display,
      height: node.getBoundingClientRect().height,
      width: node.getBoundingClientRect().width,
      line: {
        stroke: getComputedStyle(node.querySelector("line")).stroke,
        strokeWidth: getComputedStyle(node.querySelector("line")).strokeWidth,
      },
    }));
    const markers = [...document.querySelectorAll(".combat-marker")].map((node) => {
      const art = node.querySelector(".combat-art");
      const rect = node.getBoundingClientRect();
      return {
        id: node.dataset.combatId,
        transform: art ? getComputedStyle(art).transform : null,
        filter: art ? getComputedStyle(art).filter : null,
        bounds: [rect.x, rect.y, rect.width, rect.height],
      };
    });
    return {
      browserBytes: controller.serialize(),
      combatHtml: layer("combat"),
      effectsHtml: layer("effects"),
      feedbackHtml: layer("feedback"),
      hand,
      inputSlots: slots,
      questionNotice: (() => {
        const node = document.querySelector('[data-ui="policy-question"]');
        return node ? {
          cardId: node.dataset.cardId ?? null,
          disposition: node.dataset.disposition ?? null,
          hidden: node.hidden,
          text: node.textContent,
          unverifiedFields: node.dataset.unverifiedFields ?? null,
        } : null;
      })(),
      focus: {
        cardId: document.activeElement?.dataset?.cardId ?? null,
        tag: document.activeElement?.tagName ?? null,
      },
      markers,
      sessionBytes: controller.session.serialize(),
      targetLinks,
    };
  });
}

async function renderedPaintState(page) {
  return page.evaluate(() => {
    const nodes = [...document.querySelectorAll("*")];
    return nodes.map((node, index) => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        attrs: [...node.attributes].map(({ name, value }) => [name, value]),
        background: style.background,
        boxShadow: style.boxShadow,
        color: style.color,
        filter: style.filter,
        font: style.font,
        html: node.outerHTML,
        index,
        opacity: style.opacity,
        rect: [rect.x, rect.y, rect.width, rect.height],
        tag: node.tagName,
        transform: style.transform,
        translate: style.translate,
      };
    });
  });
}

function paintStateDifferences(left, right) {
  const differences = [];
  const count = Math.max(left.length, right.length);
  for (let index = 0; index < count; index += 1) {
    if (JSON.stringify(left[index]) !== JSON.stringify(right[index])) {
      differences.push({ index, left: left[index] ?? null, right: right[index] ?? null });
      if (differences.length === 8) break;
    }
  }
  return differences;
}

async function comparePngPixels(page, left, right) {
  return page.evaluate(async ([leftBase64, rightBase64]) => {
    const read = async (base64) => {
      const image = new Image();
      image.src = `data:image/png;base64,${base64}`;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      return { data: context.getImageData(0, 0, canvas.width, canvas.height).data,
        height: canvas.height, width: canvas.width };
    };
    const [a, b] = await Promise.all([read(leftBase64), read(rightBase64)]);
    if (a.width !== b.width || a.height !== b.height) {
      return { height: a.height, maxChannelDelta: 255, meanChannelDelta: 255,
        pixelsOver8: a.width * a.height, width: a.width };
    }
    let maxChannelDelta = 0;
    let totalChannelDelta = 0;
    let changedPixels = 0;
    let pixelsOver8 = 0;
    for (let offset = 0; offset < a.data.length; offset += 4) {
      const delta = Math.max(Math.abs(a.data[offset] - b.data[offset]),
        Math.abs(a.data[offset + 1] - b.data[offset + 1]),
        Math.abs(a.data[offset + 2] - b.data[offset + 2]));
      maxChannelDelta = Math.max(maxChannelDelta, delta);
      totalChannelDelta += Math.abs(a.data[offset] - b.data[offset]) +
        Math.abs(a.data[offset + 1] - b.data[offset + 1]) +
        Math.abs(a.data[offset + 2] - b.data[offset + 2]);
      if (delta > 0) changedPixels += 1;
      if (delta > 8) pixelsOver8 += 1;
    }
    return {
      changedPixels,
      height: a.height,
      maxChannelDelta,
      meanChannelDelta: totalChannelDelta / (a.width * a.height * 3),
      pixelsOver8,
      width: a.width,
    };
  }, [left.toString("base64"), right.toString("base64")]);
}

test("game browser building choice: Bulwark Needle deploys and defends through the shared session", {
  timeout: 600_000,
}, async () => {
  assert.ok(existsSync(PLAYWRIGHT), "installed Playwright equivalent is required");
  assert.ok(existsSync(CHROME), "installed Chrome is required");
  mkdirSync(ARTIFACTS, { recursive: true });
  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let browser;
  const consoleErrors = [];
  const pageErrors = [];
  const evidence = { consoleErrors, pageErrors };
  try {
    const ready = JSON.parse(await line(server.stdout));
    const { chromium } = await import(PLAYWRIGHT);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const context = await browser.newContext({ deviceScaleFactor: 1,
      viewport: { height: 1_280, width: 720 } });
    await context.addInitScript(() => {
      window.__nativePaintFrame = window.requestAnimationFrame.bind(window);
      let nextFrame = 1;
      const pending = new Map();
      window.requestAnimationFrame = (callback) => {
        const handle = nextFrame++;
        pending.set(handle, callback);
        return handle;
      };
      window.cancelAnimationFrame = (handle) => pending.delete(handle);
    });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    const response = await page.goto(
      `http://${ready.host}:${ready.port}/public/ui-arena-shell.html`,
      { waitUntil: "domcontentloaded" },
    );
    assert.equal(response.status(), 200);
    await page.waitForSelector('[data-ui="deck-choice-open"]');
    const standardOpening = await page.evaluate(async () => {
      const controller = (await import("/src/ui/arena-shell-entry.js")).arenaHudController;
      controller.enterManualStepMode();
      globalThis.__bulwarkChoiceController = controller;
      const dialog = document.querySelector('[data-ui="deck-choice"]');
      const focusResults = [...dialog.querySelectorAll("button")].map((node) => {
        node.focus({ preventScroll: true });
        return document.activeElement === node;
      });
      return {
        choiceHidden: document.querySelector('[data-ui="deck-choice-open"]').hidden,
        dialogDisplay: getComputedStyle(dialog).display,
        dialogHidden: dialog.hidden,
        focusResults,
        sessionBytes: controller.session.serialize(),
        sessionTick: controller.state.sessionTick,
      };
    });
    const seedZero = new GameSession(createShippedGameSessionSetup(0));
    assert.equal(standardOpening.sessionBytes, seedZero.serialize(),
      "the visible selector keeps the seed-zero Standard session exact");
    assert.equal(standardOpening.choiceHidden, false);
    assert.equal(standardOpening.dialogHidden, true);
    assert.equal(standardOpening.dialogDisplay, "none");
    assert.deepEqual(standardOpening.focusResults, [false, false, false, false],
      "closed chooser controls remain outside keyboard focus");
    assert.equal(standardOpening.sessionTick, 0);
    await page.screenshot({ path: `${ARTIFACTS}standard-opening.png` });

    await click(page, '[data-ui="deck-choice-open"]');
    await page.waitForSelector('[data-ui="deck-choice"]:not([hidden])');
    const dialogState = await page.evaluate(() => {
      const controller = globalThis.__bulwarkChoiceController;
      const dialog = document.querySelector('[data-ui="deck-choice"]');
      const panel = dialog.querySelector(".deck-choice__panel").getBoundingClientRect();
      return {
        bulwarkOptionDescription: document.querySelector(
          '[data-deck-choice="bulwark-needle"] span',
        ).textContent,
        modalDisplay: getComputedStyle(dialog).display,
        modalWidth: Math.round(dialog.getBoundingClientRect().width),
        panel: { height: Math.round(panel.height), width: Math.round(panel.width) },
        selected: document.querySelector('[data-deck-choice="standard"]')
          .getAttribute("aria-pressed"),
        sessionBytes: controller.session.serialize(),
        sessionTick: controller.state.sessionTick,
        running: controller.state.running,
      };
    });
    assert.equal(dialogState.modalDisplay, "grid");
    assert.equal(dialogState.modalWidth, 720);
    assert.match(dialogState.bulwarkOptionDescription, /combat QUESTION/u,
      "the pre-match choice exposes the defensive policy status");
    assert.equal(dialogState.sessionBytes, seedZero.serialize());
    assert.equal(dialogState.sessionTick, 0);
    assert.equal(dialogState.running, false);
    await page.screenshot({ path: `${ARTIFACTS}pre-match-choice.png` });

    await click(page, '[data-deck-choice="bulwark-needle"]');
    const pendingChoice = await page.evaluate(() => ({
      bulwarkPressed: document.querySelector('[data-deck-choice="bulwark-needle"]')
        .getAttribute("aria-pressed"),
      standardPressed: document.querySelector('[data-deck-choice="standard"]')
        .getAttribute("aria-pressed"),
      sessionBytes: globalThis.__bulwarkChoiceController.session.serialize(),
    }));
    assert.equal(pendingChoice.bulwarkPressed, "true");
    assert.equal(pendingChoice.standardPressed, "false");
    assert.equal(pendingChoice.sessionBytes, seedZero.serialize(),
      "a pending chooser selection does not replace session authority");
    await click(page, '[data-ui="deck-start"]');
    await page.evaluate(() => globalThis.__bulwarkChoiceController.enterManualStepMode());

    const expectedSession = new GameSession(
      createShippedGameSessionSetup(1, "bulwark-needle-witness"),
    );
    const sourceCard = projectSessionNonUnitBattleCard("bulwark-needle");
    const opening = await page.evaluate(() => {
      const controller = globalThis.__bulwarkChoiceController;
      const session = controller.session;
      const setup = JSON.parse(session.serialize()).setup;
      const battleSetup = JSON.parse(setup.battleSetup);
      const cards = new Map(battleSetup.roster.map((card) => [card.id, card]));
      const hand = session.state.decks.south.hand.map((id) => ({
        cost: cards.get(id).cost,
        id,
        name: cards.get(id).displayName,
      }));
      const hudHand = [...document.querySelectorAll('[data-ui="hud-hand"] .hud-card')]
        .map((node) => ({
          cost: Number(node.querySelector(".hud-card__cost").textContent),
          id: node.dataset.cardId,
          name: node.querySelector(".hud-card__name").textContent,
        }));
      return {
        battleSetup,
        hand,
        hudHand,
        inputSlots: [...document.querySelectorAll('[data-ui="card-slot"]')]
          .map((node) => node.dataset.cardId),
        sessionBytes: session.serialize(),
        sessionTick: session.state.tick,
        setup,
        questionNotice: (() => {
          const node = document.querySelector('[data-ui="policy-question"]');
          return node ? {
            cardId: node.dataset.cardId ?? null,
            disposition: node.dataset.disposition ?? null,
            hidden: node.hidden,
            text: node.textContent,
            unverifiedFields: node.dataset.unverifiedFields ?? null,
          } : null;
        })(),
      };
    });
    const expectedSetup = JSON.parse(expectedSession.serialize()).setup;
    const bulwark = opening.battleSetup.roster.find(({ id }) => id === "bulwark-needle");
    assert.equal(opening.sessionBytes, expectedSession.serialize());
    assert.equal(opening.sessionTick, 0);
    assert.deepEqual(opening.setup.deck, [
      "bulwark-needle", "coilblade", "mossguard", "copperskiff", "skymaul",
      "brassbolt", "reedsting", "briar-band",
    ]);
    assert.ok(!opening.setup.deck.includes("cinderlings"),
      "Bulwark Needle replaces Cinderlings in an eight-card deck");
    assert.deepEqual(bulwark, sourceCard,
      "the chooser preserves source identity and QUESTION-tagged combat provenance");
    assert.deepEqual(opening.battleSetup.roster, JSON.parse(expectedSetup.battleSetup).roster);
    assert.deepEqual(opening.hudHand, opening.hand,
      "HUD names and costs come from the selected GameSession roster");
    assert.deepEqual(opening.inputSlots, opening.hand.map(({ id }) => id),
      "physical input slots mirror the selected GameSession hand");
    assert.ok(opening.hand.some(({ id, cost, name }) =>
      id === "bulwark-needle" && cost === 3 && name === "Bulwark Needle"));
    assert.deepEqual(opening.questionNotice, {
      cardId: "bulwark-needle",
      disposition: "question",
      hidden: false,
      text: "Bulwark Needle combat: QUESTION. First-hit timing is absent; damage, HP, deploy, range and target fields are unverified.",
      unverifiedFields: "damage,deployTicks,firstHitTicks,hitpoints,maxRange,mode,sightRange",
    }, "the running match visibly carries the source confidence boundary");
    await page.screenshot({ path: `${ARTIFACTS}bulwark-opening.png` });

    await click(page, '[data-ui="card-slot"][data-card-id="bulwark-needle"]');
    const selected = await page.evaluate(() =>
      document.querySelector('[data-ui="hud-hand"] [data-card-id="bulwark-needle"]')
        ?.dataset.selected ?? null);
    assert.equal(selected, "true", "the structure card accepts a trusted hand gesture");
    await page.screenshot({ path: `${ARTIFACTS}bulwark-selected.png` });
    await click(page, '[data-ui="arena"]', { x: 105, y: 666 });
    await page.evaluate(() => globalThis.__bulwarkChoiceController.stepMany(1));
    const deployed = await page.evaluate(() => {
      const controller = globalThis.__bulwarkChoiceController;
      const state = controller.session.state;
      const event = controller.session.replay.find(({ side, type }) =>
        side === "south" && type === "session-structure-deployed");
      const structure = state.battle.structures.find(({ cardId, side }) =>
        cardId === "bulwark-needle" && side === "south");
      const marker = document.querySelector(
        '.combat-marker[data-kind="bulwark-needle"] .combat-art',
      );
      return {
        artId: marker?.dataset.artId ?? null,
        artPathCount: marker?.querySelectorAll("path").length ?? 0,
        event: event ?? null,
        hand: state.decks.south.hand,
        inputSlots: [...document.querySelectorAll('[data-ui="card-slot"]')]
          .map((node) => node.dataset.cardId),
        southElixir: state.elixir.sides.south.amount,
        structure,
        structurePolicy: structure?.policy ?? null,
        structureMarkerCount: document.querySelectorAll(
          '.combat-marker[data-kind="bulwark-needle"]',
        ).length,
        unitCount: state.battle.units.filter(({ cardId }) => cardId === "bulwark-needle").length,
      };
    });
    assert.ok(deployed.event, "the trusted card gesture reaches the shared GameSession");
    assert.equal(deployed.event.spend.cost, sourceCard.cost);
    assert.equal(deployed.southElixir, 7);
    assert.equal(deployed.structure.side, "south");
    assert.equal(deployed.structure.hitpoints, sourceCard.hitpoints);
    assert.equal(deployed.structurePolicy.disposition, "question");
    assert.equal(deployed.structurePolicy.corpusFields.firstHitTicks.value, null);
    assert.ok(deployed.event.materialization.point.y < 15_000,
      "the physical structure placement is on the south deployment side");
    assert.equal(deployed.unitCount, 0);
    assert.equal(deployed.structureMarkerCount, 1,
      "the one materialized defensive structure is visible in the shared arena");
    assert.equal(deployed.artId, "bulwark-needle");
    assert.equal(deployed.artPathCount, 10,
      "the original Bulwark Needle vector art renders in combat");
    assert.deepEqual(deployed.inputSlots, deployed.hand,
      "the input hand follows the deck after the structure spend");
    await page.screenshot({ path: `${ARTIFACTS}bulwark-deployed.png` });

    const defensiveCombat = await page.evaluate(() => {
      const controller = globalThis.__bulwarkChoiceController;
      let advancedTicks = 0;
      const inspect = () => {
        const structure = controller.session.state.battle.structures.find(({ cardId, side }) =>
          cardId === "bulwark-needle" && side === "south");
        const marker = document.querySelector('.combat-marker[data-kind="bulwark-needle"]');
        const targetLinks = [...document.querySelectorAll(
          '.combat-target-link[data-from-structure="true"]',
        )];
        const attacks = controller.session.replay.filter(({ buildingId, type }) =>
          buildingId === structure.id && type === "structure-attack");
        return {
          attackCount: attacks.length,
          firstAttack: attacks[0] ?? null,
          hitpoints: structure.hitpoints,
          markerTargeting: marker?.dataset.targeting ?? null,
          targetKey: structure.targetKey,
          targetLinkCount: targetLinks.length,
          targetLinkDisplay: targetLinks.map((node) => getComputedStyle(node).display),
          tick: controller.session.state.tick,
        };
      };
      let snapshot = inspect();
      while (snapshot.markerTargeting !== "true" && advancedTicks < 240) {
        controller.stepMany(1);
        advancedTicks += 1;
        snapshot = inspect();
      }
      return { ...snapshot, advancedTicks };
    });
    assert.equal(defensiveCombat.markerTargeting, "true",
      `Bulwark's live target must reach the combat projection: ${JSON.stringify(defensiveCombat)}`);
    assert.ok(defensiveCombat.targetKey?.startsWith("unit:"));
    assert.ok(defensiveCombat.targetLinkCount > 0,
      "the rendered structure view follows its live combat target");
    assert.ok(defensiveCombat.targetLinkDisplay.includes("block"),
      "the structure target path is visible in the arena");
    await page.screenshot({ path: `${ARTIFACTS}bulwark-defensive-combat.png` });
    const checkpoint = await renderedState(page);
    const checkpointPaintState = await renderedPaintState(page);
    const artBounds = await page.locator(
      '.combat-marker[data-kind="bulwark-needle"]',
    ).boundingBox();
    assert.ok(artBounds);
    const artClip = {
      height: Math.ceil(artBounds.height + 20),
      width: Math.ceil(artBounds.width + 20),
      x: Math.max(0, Math.floor(artBounds.x - 10)),
      y: Math.max(0, Math.floor(artBounds.y - 10)),
    };
    const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
    await settleBrowserPaint(page);
    const checkpointPng = await page.screenshot({
      path: `${ARTIFACTS}bulwark-restore-checkpoint.png`,
    });
    const checkpointRepeatPng = await page.screenshot({
      path: `${ARTIFACTS}bulwark-restore-checkpoint-repeat.png`,
    });
    const forward = await page.evaluate(() => {
      const controller = globalThis.__bulwarkChoiceController;
      controller.stepMany(140);
      const structure = controller.session.state.battle.structures.find(({ cardId, side }) =>
        cardId === "bulwark-needle" && side === "south");
      const attacks = controller.session.replay.filter(({ buildingId, type }) =>
        buildingId === structure.id && type === "structure-attack");
      return {
        attackCount: attacks.length,
        browserBytes: controller.serialize(),
        firstAttack: attacks[0] ?? null,
        hitpoints: structure.hitpoints,
        sessionBytes: controller.session.serialize(),
      };
    });
    assert.ok(forward.attackCount > 0,
      "the QUESTION-tagged provisional reducer launches its Bulwark estimates");
    assert.ok(forward.hitpoints > 0 && forward.hitpoints < sourceCard.hitpoints,
      "the shared battle shows live damage to the structure");
    const forwardPng = await page.screenshot();
    await page.evaluate((bytes) => globalThis.__bulwarkChoiceController.restore(bytes),
      checkpoint.browserBytes);
    await settleBrowserPaint(page);
    const restored = await renderedState(page);
    const restoredPaintState = await renderedPaintState(page);
    const restoredPng = await page.screenshot({
      path: `${ARTIFACTS}bulwark-restore-rebuilt.png`,
    });
    const restoredRepeatPng = await page.screenshot({
      path: `${ARTIFACTS}bulwark-restore-rebuilt-repeat.png`,
    });
    assert.equal(restored.browserBytes, checkpoint.browserBytes,
      "restore reproduces exact browser snapshot bytes");
    assert.equal(restored.sessionBytes, checkpoint.sessionBytes,
      "restore reproduces the exact GameSession state");
    assert.equal(restored.combatHtml, checkpoint.combatHtml,
      "restore reproduces structure, target-link, and combat art DOM bytes");
    assert.equal(restored.effectsHtml, checkpoint.effectsHtml);
    assert.equal(restored.feedbackHtml, checkpoint.feedbackHtml);
    assert.deepEqual(restored.questionNotice, checkpoint.questionNotice,
      "restore keeps the visible building QUESTION notice and source fields");
    assert.deepEqual(restored.hand, checkpoint.hand,
      "restore returns the HUD cards to the exact source-backed state");
    assert.deepEqual(restored.inputSlots, checkpoint.inputSlots,
      "restore returns the input slots to the exact deck hand");
    assert.deepEqual(restored.focus, checkpoint.focus,
      "restore preserves the active HUD focus target");
    assert.deepEqual(restored.targetLinks, checkpoint.targetLinks,
      "restore rebuilds the visible structure target path");
    assert.deepEqual(restored.markers, checkpoint.markers,
      `restore rebuilds marker render state: ${JSON.stringify({
        checkpoint: checkpoint.markers, restored: restored.markers,
      })}`);
    const viewportPixelExact = hash(restoredPng) === hash(checkpointPng);
    let checkpointArtPng;
    let restoredArtPng;
    let viewportRaster;
    let bulwarkArtRaster;
    let restoredPairRaster;
    const bitmapPage = await page.context().newPage();
    try {
      checkpointArtPng = await cropPngOnBlankPage(bitmapPage, checkpointPng,
        artClip, `${ARTIFACTS}bulwark-art-before-restore.png`);
      restoredArtPng = await cropPngOnBlankPage(bitmapPage, restoredPng,
        artClip, `${ARTIFACTS}bulwark-art-after-restore.png`);
      viewportRaster = await comparePngPixels(bitmapPage, checkpointPng, restoredPng);
      restoredPairRaster = await comparePngPixels(bitmapPage, restoredPng,
        restoredRepeatPng);
      bulwarkArtRaster = await comparePngPixels(bitmapPage,
        checkpointArtPng, restoredArtPng);
    } finally {
      await bitmapPage.close();
    }
    const bulwarkArtPixelExact = hash(restoredArtPng) === hash(checkpointArtPng);
    assert.ok(bulwarkArtRaster.maxChannelDelta <= 4 &&
      bulwarkArtRaster.meanChannelDelta < 0.5 && bulwarkArtRaster.pixelsOver8 === 0,
    `Bulwark art crop is visually unchanged: ${JSON.stringify(bulwarkArtRaster)}`);
    assert.notEqual(hash(forwardPng), hash(checkpointPng),
      "the simulated continuation changes the visible combat state");
    evidence.restoreRaster = {
      artClip,
      artRaster: bulwarkArtRaster,
      artSource: "off-page bitmap crops from full viewport PNG captures",
      checkpointHash: hash(checkpointPng),
      restoredHash: hash(restoredPng),
      restoredRepeatHash: hash(restoredRepeatPng),
      restoredPairRaster,
      viewportRaster,
    };
    assert.equal(hash(restoredPng), hash(checkpointPng),
      `restored full viewport must be pixel-identical with the post-restore crop derived off-page: ${JSON.stringify({
        checkpoint: hash(checkpointPng), restored: hash(restoredPng), viewportRaster,
      })}`);
    assert.equal(hash(restoredRepeatPng), hash(checkpointPng),
      `second restored full viewport must be byte-identical to checkpoint: ${JSON.stringify({
        checkpoint: hash(checkpointPng), restoredRepeat: hash(restoredRepeatPng),
        restoredPairRaster,
      })}`);
    await page.screenshot({ path: `${ARTIFACTS}bulwark-restored.png` });
    const replayed = await page.evaluate(() => {
      const controller = globalThis.__bulwarkChoiceController;
      controller.stepMany(140);
      const structure = controller.session.state.battle.structures.find(({ cardId, side }) =>
        cardId === "bulwark-needle" && side === "south");
      const attacks = controller.session.replay.filter(({ buildingId, type }) =>
        buildingId === structure.id && type === "structure-attack");
      return { attackCount: attacks.length, browserBytes: controller.serialize(),
        firstAttack: attacks[0] ?? null, hitpoints: structure.hitpoints,
        sessionBytes: controller.session.serialize() };
    });
    assert.deepEqual(replayed, forward,
      "restored session and browser continuation bytes reproduce exactly");
    await page.screenshot({ path: `${ARTIFACTS}bulwark-continuation.png` });

    const terminal = await page.evaluate(() => {
      const controller = globalThis.__bulwarkChoiceController;
      let chunks = 0;
      while (!controller.state.terminal && chunks < 15) {
        controller.fastForwardSegment(1_200);
        chunks += 1;
      }
      return { chunks, result: controller.session.state.clock.result,
        state: controller.state, sessionTick: controller.session.state.tick };
    });
    assert.equal(terminal.state.terminal, true,
      "the selected defensive deck reaches the GameSession terminal state");
    await page.screenshot({ path: `${ARTIFACTS}bulwark-terminal.png` });
    await click(page, '[data-ui="restart"]');
    const restarted = await page.evaluate(() => {
      const controller = globalThis.__bulwarkChoiceController;
      return {
        deck: JSON.parse(controller.session.serialize()).setup.deck,
        restartCount: controller.state.restartCount,
        restartHidden: document.querySelector('[data-ui="restart"]').hidden,
        sessionBytes: controller.session.serialize(),
        sessionTick: controller.state.sessionTick,
      };
    });
    assert.equal(restarted.restartCount, 1);
    assert.equal(restarted.restartHidden, true);
    assert.equal(restarted.sessionTick, 0);
    assert.equal(restarted.sessionBytes, expectedSession.serialize(),
      "same-deck restart installs the exact Bulwark witness opening");
    assert.deepEqual(restarted.deck, expectedSetup.deck);
    await page.screenshot({ path: `${ARTIFACTS}bulwark-restart.png` });

    evidence.standard = {
      hiddenControlsCannotFocus: standardOpening.focusResults.every((value) => !value),
      seedZeroExact: standardOpening.sessionBytes === seedZero.serialize(),
    };
    evidence.chooser = {
      bulwarkSelected: pendingChoice.bulwarkPressed === "true",
      modalWidth: dialogState.modalWidth,
      preMatchSeedZeroExact: dialogState.sessionBytes === seedZero.serialize(),
      runningDuringChoice: dialogState.running,
    };
    evidence.bulwark = {
      artId: deployed.artId,
      artPathCount: deployed.artPathCount,
      attackCount: forward.attackCount,
      firstAttack: forward.firstAttack,
      hitpointsAfterCombat: forward.hitpoints,
      hand: opening.hand,
      inputSlots: opening.inputSlots,
      placement: deployed.event.materialization.point,
      questionCount: opening.battleSetup.questions.length,
      questionNotice: opening.questionNotice,
      restore: {
        browserBytesExact: restored.browserBytes === checkpoint.browserBytes,
        checkpointCapturePixelExact: hash(checkpointRepeatPng) === hash(checkpointPng),
        paintStateDifferences: paintStateDifferences(checkpointPaintState, restoredPaintState),
        combatDomExact: restored.combatHtml === checkpoint.combatHtml,
        hudExact: JSON.stringify(restored.hand) === JSON.stringify(checkpoint.hand),
        inputExact: JSON.stringify(restored.inputSlots) === JSON.stringify(checkpoint.inputSlots),
        bulwarkArtPixelExact,
        bulwarkArtRaster,
        pixels: hash(checkpointPng),
        pixelsRepeatAtCheckpoint: hash(checkpointRepeatPng),
        pixelsAfterRestore: hash(restoredPng),
        viewportRaster,
        viewportPixelExact,
        sessionBytesExact: restored.sessionBytes === checkpoint.sessionBytes,
      },
      restartExact: restarted.sessionBytes === expectedSession.serialize(),
      restartCount: restarted.restartCount,
      sessionDeck: opening.setup.deck,
      southElixirAfterDeploy: deployed.southElixir,
      targetKey: defensiveCombat.targetKey,
      targetLinksVisible: defensiveCombat.targetLinkDisplay.includes("block"),
      targetAcquiredAfterTicks: defensiveCombat.advancedTicks,
      attackCountAfterCombat: forward.attackCount,
      terminalChunks: terminal.chunks,
      terminalResult: terminal.result,
      terminalTick: terminal.sessionTick,
    };
    assert.equal(hash(restoredPng), hash(checkpointPng),
      `restored full viewport must be pixel-identical: ${JSON.stringify({
        checkpoint: hash(checkpointPng), restored: hash(restoredPng), viewportRaster,
      })}`);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
  } finally {
    writeFileSync(`${ARTIFACTS}building-choice-evidence.json`,
      `${JSON.stringify(evidence, null, 2)}\n`);
    server.kill("SIGTERM");
    await Promise.race([once(server, "exit"), new Promise((resolve) =>
      setTimeout(resolve, 2_000))]);
    await browser?.close();
  }
});
