import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import test from "node:test";

import { projectSessionNonUnitBattleCard } from
  "../../../src/content/session-card-catalog.js";
import { GameSession } from "../../../src/sim/game-session.js";
import { createShippedGameSessionSetup } from "../../../src/ui/game-browser-entry.js";

import { cropPngOnBlankPage } from "../../../tests/helpers/png-crop.js";
import { captureElixirRasterEvidence } from
  "../../../tests/helpers/elixir-raster-evidence.js";

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS = process.env.BROWSER_FRAME_RESTORE_ARTIFACTS ??
  new URL("./", import.meta.url).pathname;

async function line(stream) {
  let value = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) {
    value += chunk;
    const end = value.indexOf("\n");
    if (end >= 0) return value.slice(0, end);
  }
  throw new Error("browser-frame-restore server exited before readiness");
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

async function stateBytes(page) {
  return page.evaluate(() => {
    const controller = globalThis.__frameRestoreController;
    const controllerState = controller.state;
    const layers = ["combat", "effects", "feedback", "hud"].map((name) => [
      name,
      document.querySelector(`[data-game-browser-layer="${name}"]`).innerHTML,
    ]);
    const slots = [...document.querySelectorAll('[data-ui="card-slot"]')]
      .map((node) => node.outerHTML);
    return {
      arenaHtml: document.querySelector('[data-ui="arena"]').innerHTML,
      browserBytes: controller.serialize(),
      hudHtml: document.querySelector('[data-game-browser-layer="hud"]').innerHTML,
      inputHtml: JSON.stringify(slots),
      layers,
      running: controllerState.running,
      sessionBytes: controller.session.serialize(),
      sessionTick: controller.session.state.tick,
    };
  });
}

async function paintState(page) {
  return page.evaluate(() => [...document.querySelectorAll("*")].map((node, index) => {
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
  }));
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
      return { changedPixels: a.width * a.height, height: a.height,
        maxChannelDelta: 255, width: a.width };
    }
    let changedPixels = 0;
    let maxChannelDelta = 0;
    for (let offset = 0; offset < a.data.length; offset += 4) {
      const delta = Math.max(Math.abs(a.data[offset] - b.data[offset]),
        Math.abs(a.data[offset + 1] - b.data[offset + 1]),
        Math.abs(a.data[offset + 2] - b.data[offset + 2]));
      if (delta > 0) changedPixels += 1;
      maxChannelDelta = Math.max(maxChannelDelta, delta);
    }
    return { changedPixels, height: a.height, maxChannelDelta, width: a.width };
  }, [left.toString("base64"), right.toString("base64")]);
}

async function captureRestoreWitness(page, label, artifactName, branchTicks = 2,
  captureArt = false) {
  const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const checkpointState = await stateBytes(page);
  const checkpointPaint = await paintState(page);
  const artBounds = captureArt ? await page.locator(
    '.combat-marker[data-kind="bulwark-needle"]',
  ).boundingBox() : null;
  const artClip = artBounds ? {
    height: Math.ceil(artBounds.height + 20),
    width: Math.ceil(artBounds.width + 20),
    x: Math.max(0, Math.floor(artBounds.x - 10)),
    y: Math.max(0, Math.floor(artBounds.y - 10)),
  } : null;
  await settleBrowserPaint(page);
  const checkpointPng = await page.screenshot({
    path: `${ARTIFACTS}${artifactName}-checkpoint.png`,
  });
  const repeatPng = await page.screenshot();
  const checkpointElixirRaster = await captureElixirRasterEvidence(page,
    "__frameRestoreController");

  const forwardState = await page.evaluate((ticks) => {
    const controller = globalThis.__frameRestoreController;
    controller.stepMany(ticks);
    return {
      browserBytes: controller.serialize(),
      sessionBytes: controller.session.serialize(),
      sessionTick: controller.session.state.tick,
    };
  }, branchTicks);
  const forwardPng = await page.screenshot({
    path: `${ARTIFACTS}${artifactName}-forward.png`,
  });
  await page.evaluate(() => globalThis.__frameRestoreController.restore(
    globalThis.__frameRestoreSnapshot));
  await settleBrowserPaint(page);
  const restoredState = await stateBytes(page);
  const restoredPaint = await paintState(page);
  const restoredPng = await page.screenshot({
    path: `${ARTIFACTS}${artifactName}-restored.png`,
  });
  const restoredRepeatPng = await page.screenshot({
    path: `${ARTIFACTS}${artifactName}-restored-repeat.png`,
  });
  const restoredElixirRaster = await captureElixirRasterEvidence(page,
    "__frameRestoreController");
  let artPixelDelta = null;
  let consecutivePixelDelta;
  let restorePairPixelDelta;
  let restorePixelDelta;
  const bitmapPage = await page.context().newPage();
  try {
    consecutivePixelDelta = await comparePngPixels(bitmapPage, checkpointPng, repeatPng);
    restorePairPixelDelta = await comparePngPixels(bitmapPage,
      restoredPng, restoredRepeatPng);
    restorePixelDelta = await comparePngPixels(bitmapPage, checkpointPng, restoredPng);
    if (artClip) {
      const checkpointArtPng = await cropPngOnBlankPage(bitmapPage, checkpointPng,
        artClip, `${ARTIFACTS}${artifactName}-art-checkpoint.png`);
      const restoredArtPng = await cropPngOnBlankPage(bitmapPage, restoredPng,
        artClip, `${ARTIFACTS}${artifactName}-art-restored.png`);
      artPixelDelta = await comparePngPixels(bitmapPage,
        checkpointArtPng, restoredArtPng);
    }
  } finally {
    await bitmapPage?.close();
  }
  const report = {
    checkpointSha256: hash(checkpointPng),
    consecutiveSha256: hash(repeatPng),
    consecutivePixelDelta,
    checkpointElixirRaster,
    checkpointBrowserSha256: hash(checkpointState.browserBytes),
    checkpointSessionSha256: hash(checkpointState.sessionBytes),
    branchTicks,
    checkpointTick: checkpointState.sessionTick,
    exactBrowserState: restoredState.browserBytes === checkpointState.browserBytes,
    exactSessionState: restoredState.sessionBytes === checkpointState.sessionBytes,
    exactPaintState: JSON.stringify(restoredPaint) === JSON.stringify(checkpointPaint),
    exactArenaDom: restoredState.arenaHtml === checkpointState.arenaHtml,
    exactLayerDom: JSON.stringify(restoredState.layers) ===
      JSON.stringify(checkpointState.layers),
    exactHud: restoredState.hudHtml === checkpointState.hudHtml,
    exactInput: restoredState.inputHtml === checkpointState.inputHtml,
    label,
    artClip,
    artPixelDelta,
    restoredArtSource: artClip ? "off-page bitmap crop from restored full viewport PNG" : null,
    restoreSha256: hash(restoredPng),
    restoreRepeatSha256: hash(restoredRepeatPng),
    restoredBrowserSha256: hash(restoredState.browserBytes),
    restoredSessionSha256: hash(restoredState.sessionBytes),
    restorePairPixelDelta,
    restorePixelDelta,
    restoredElixirRaster,
    elixirRasterInputsExact: JSON.stringify(checkpointElixirRaster) ===
      JSON.stringify(restoredElixirRaster),
    forwardSha256: hash(forwardPng),
    forwardBrowserChanged: forwardState.browserBytes !== checkpointState.browserBytes,
    forwardSessionChanged: forwardState.sessionBytes !== checkpointState.sessionBytes,
    forwardTick: forwardState.sessionTick,
    strictConsecutivePng: repeatPng.equals(checkpointPng),
    strictRestorePng: restoredPng.equals(checkpointPng),
    strictRestoreRepeatPng: restoredPng.equals(restoredRepeatPng),
    exactRestoredArtPixels: artPixelDelta?.changedPixels === 0,
  };
  return report;
}

test("browser frame restore: full viewport PNG and visible bytes restore exactly", {
  timeout: 600_000,
}, async () => {
  mkdirSync(ARTIFACTS, { recursive: true });
  const server = spawn(process.execPath, [
    new URL("../../../tests/game-browser-journey-server.js", import.meta.url).pathname,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let browser;
  let evidence = { scenarios: [] };
  const consoleErrors = [];
  const pageErrors = [];
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
      globalThis.__frameRestoreController = controller;
      globalThis.__frameRestoreSnapshot = controller.serialize();
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

    const target = await page.evaluate(() => {
      const controller = globalThis.__frameRestoreController;
      let advancedTicks = 0;
      const structure = () => controller.session.state.battle.structures.find(
        ({ cardId, side }) => cardId === "bulwark-needle" && side === "south");
      while (structure() !== undefined && structure().targetKey == null &&
          advancedTicks < 241) {
        controller.stepMany(1);
        advancedTicks += 1;
      }
      globalThis.__frameRestoreSnapshot = controller.serialize();
      return {
        advancedTicks,
        targetKey: structure()?.targetKey ?? null,
        tick: controller.session.state.tick,
      };
    });
    const bulwarkReport = await captureRestoreWitness(page,
      "deployed targeting Bulwark Needle", "bulwark-targeting", 140, true);
    bulwarkReport.advancedTicks = target.advancedTicks;
    bulwarkReport.targetKey = target.targetKey;
    bulwarkReport.startingTick = target.tick;

    evidence = {
      chromeVersion: browser.version(),
      viewport: page.viewportSize(),
      consoleErrors,
      pageErrors,
      scenarios: [bulwarkReport],
    };
    assert.ok(target.targetKey?.startsWith("unit:"),
      `Bulwark must be deployed and targeting a live unit: ${JSON.stringify(target)}`);
    assert.equal(target.tick, 114, "the pre-target history block keeps the target checkpoint at tick 114");
    for (const report of evidence.scenarios) {
      assert.equal(report.strictConsecutivePng, true,
        `${report.label}: consecutive full viewport PNGs must be byte-identical: ${JSON.stringify(report)}`);
      assert.equal(report.strictRestorePng, true,
        `${report.label}: restored full viewport PNG must be byte-identical: ${JSON.stringify(report)}`);
      assert.equal(report.strictRestoreRepeatPng, true,
        `${report.label}: two consecutive restored full viewport PNGs must be byte-identical: ${JSON.stringify(report)}`);
      assert.equal(report.forwardTick, report.checkpointTick + report.branchTicks,
        `${report.label}: the forward branch advances the requested tick count`);
      assert.equal(report.forwardBrowserChanged, true,
        `${report.label}: browser state changes on the forward branch`);
      assert.equal(report.forwardSessionChanged, true,
        `${report.label}: session state changes on the forward branch`);
      assert.equal(report.exactBrowserState, true, `${report.label}: browser bytes`);
      assert.equal(report.exactSessionState, true, `${report.label}: session bytes`);
      assert.equal(report.exactPaintState, true,
        `${report.label}: computed paint state must restore exactly`);
      assert.equal(report.exactArenaDom, true, `${report.label}: arena DOM bytes`);
      assert.equal(report.exactLayerDom, true, `${report.label}: projected layer DOM bytes`);
      assert.equal(report.exactHud, true, `${report.label}: HUD bytes`);
      assert.equal(report.exactInput, true, `${report.label}: input slot bytes`);
      if (report.artClip) {
        assert.ok(report.artPixelDelta.maxChannelDelta <= 4 &&
          report.artPixelDelta.changedPixels <
            report.artPixelDelta.width * report.artPixelDelta.height,
        `${report.label}: restored art crop should remain visually unchanged: ${JSON.stringify(report)}`);
      }
    }
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
  } finally {
    writeFileSync(`${ARTIFACTS}restore-evidence.json`,
      `${JSON.stringify(evidence, null, 2)}\n`);
    server.kill("SIGTERM");
    await Promise.race([once(server, "exit"), new Promise((resolve) =>
      setTimeout(resolve, 2_000))]);
    await browser?.close();
  }
});
