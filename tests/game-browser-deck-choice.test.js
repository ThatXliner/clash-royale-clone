import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import test from "node:test";

import { createSessionTroopWitness } from "../src/content/session-troop-roster.js";
import { GameSession } from "../src/sim/game-session.js";
import { createShippedGameSessionSetup } from "../src/ui/game-browser-entry.js";

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS = process.env.GAME_BROWSER_DECK_CHOICE_ARTIFACTS
  ? `${process.env.GAME_BROWSER_DECK_CHOICE_ARTIFACTS.replace(/\/+$/, "")}/`
  : new URL("../artifacts/game-001huir-round-1/", import.meta.url).pathname;

async function line(stream) {
  let value = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) {
    value += chunk;
    const end = value.indexOf("\n");
    if (end >= 0) return value.slice(0, end);
  }
  throw new Error("deck-choice server exited before readiness");
}

async function click(page, selector, offset = null) {
  const box = await page.locator(selector).first().boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, `${selector} must be visible`);
  await page.mouse.click(box.x + (offset?.x ?? box.width / 2),
    box.y + (offset?.y ?? box.height / 2));
}

test("game browser deck choice: trusted pre-match choice drives both supported decks", {
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
      globalThis.__deckChoiceController = controller;
      const setup = JSON.parse(controller.session.serialize()).setup;
      const choice = document.querySelector('[data-ui="deck-choice-open"]');
      const box = choice.getBoundingClientRect();
      const dialog = document.querySelector('[data-ui="deck-choice"]');
      const hiddenChoiceButtons = [...dialog.querySelectorAll("button")];
      const hiddenChoicesCanFocus = hiddenChoiceButtons.map((node) => {
        node.focus({ preventScroll: true });
        return document.activeElement === node;
      });
      return {
        choiceBox: { height: box.height, width: box.width, x: box.x, y: box.y },
        choiceDialogDisplay: getComputedStyle(dialog).display,
        choiceDialogHidden: dialog.hidden,
        hiddenChoicesCanFocus,
        sessionBytes: controller.session.serialize(),
        sessionTick: controller.state.sessionTick,
        setup,
      };
    });
    assert.equal(standardOpening.sessionBytes,
      new GameSession(createShippedGameSessionSetup(0)).serialize(),
      "the visible selector leaves the default seed-zero session intact");
    assert.ok(standardOpening.choiceBox.width >= 72 && standardOpening.choiceBox.height >= 40,
      "the deck-choice control is visible at the shipped viewport");
    assert.equal(standardOpening.choiceDialogHidden, true);
    assert.equal(standardOpening.choiceDialogDisplay, "none");
    assert.deepEqual(standardOpening.hiddenChoicesCanFocus, [false, false, false],
      "closed deck choices are hidden and excluded from keyboard focus");
    assert.equal(standardOpening.sessionTick, 0);
    await page.screenshot({ path: `${ARTIFACTS}standard-opening.png` });

    await click(page, '[data-ui="deck-choice-open"]');
    await page.waitForSelector('[data-ui="deck-choice"]:not([hidden])');
    const prep = await page.evaluate(() => {
      const controller = globalThis.__deckChoiceController;
      const choice = document.querySelector('[data-ui="deck-choice"]');
      return {
        modal: { display: getComputedStyle(choice).display,
          height: Math.round(choice.getBoundingClientRect().height),
          width: Math.round(choice.getBoundingClientRect().width) },
        selected: document.querySelector('[data-deck-choice="standard"]')
          .getAttribute("aria-pressed"),
        sessionBytes: controller.session.serialize(),
        sessionTick: controller.state.sessionTick,
        running: controller.state.running,
      };
    });
    assert.deepEqual(prep.modal, { display: "grid", height: 1_280, width: 720 });
    assert.equal(prep.sessionBytes,
      new GameSession(createShippedGameSessionSetup(0)).serialize(),
      "opening deck choice resets before any new match begins");
    assert.equal(prep.sessionTick, 0);
    assert.equal(prep.running, false, "the pre-match selection holds browser advancement");
    await page.screenshot({ path: `${ARTIFACTS}pre-match-choice.png` });

    await click(page, '[data-deck-choice="standard"]');
    await click(page, '[data-ui="deck-start"]');
    await page.evaluate(() => globalThis.__deckChoiceController.enterManualStepMode());
    const standardStarted = await page.evaluate(() => ({
      modalHidden: document.querySelector('[data-ui="deck-choice"]').hidden,
      sessionBytes: globalThis.__deckChoiceController.session.serialize(),
      setup: JSON.parse(globalThis.__deckChoiceController.session.serialize()).setup,
    }));
    assert.equal(standardStarted.modalHidden, true);
    assert.equal(standardStarted.sessionBytes,
      new GameSession(createShippedGameSessionSetup(0)).serialize(),
      "selecting Standard starts the exact seed-zero session");
    await click(page, '[data-ui="card-slot"]');
    await click(page, '[data-ui="arena"]', { x: 270, y: 760 });
    await page.evaluate(() => globalThis.__deckChoiceController.stepMany(1));
    const standardDeploy = await page.evaluate(() => {
      const controller = globalThis.__deckChoiceController;
      const session = controller.session;
      const event = session.replay.find(({ side, type }) =>
        side === "south" && type === "session-deployed");
      return { event, tick: session.state.tick,
        unitCount: session.state.battle.units.filter(({ side }) => side === "south").length };
    });
    assert.ok(standardDeploy.event, "the unchanged standard hand still deploys through GameSession");
    assert.equal(standardDeploy.tick, 1);
    assert.ok(standardDeploy.unitCount > 0);
    evidence.standard = {
      deck: JSON.parse(standardStarted.sessionBytes).setup.deck,
      deployed: standardDeploy.event,
      startMatchedSeedZero: standardStarted.sessionBytes ===
        new GameSession(createShippedGameSessionSetup(0)).serialize(),
    };
    await page.screenshot({ path: `${ARTIFACTS}standard-deployed.png` });
    await page.close();

    const witnessPage = await context.newPage();
    witnessPage.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    witnessPage.on("pageerror", (error) => pageErrors.push(String(error)));
    const witnessResponse = await witnessPage.goto(
      `http://${ready.host}:${ready.port}/public/ui-arena-shell.html`,
      { waitUntil: "domcontentloaded" },
    );
    assert.equal(witnessResponse.status(), 200);
    await witnessPage.waitForSelector('[data-ui="deck-choice-open"]');
    await witnessPage.evaluate(async () => {
      const controller = (await import("/src/ui/arena-shell-entry.js")).arenaHudController;
      controller.enterManualStepMode();
      globalThis.__deckChoiceController = controller;
    });
    await click(witnessPage, '[data-ui="deck-choice-open"]');
    await witnessPage.waitForSelector('[data-ui="deck-choice"]:not([hidden])');
    await click(witnessPage, '[data-deck-choice="stonehauler"]');
    const selectedBeforeStart = await witnessPage.evaluate(() => ({
      altPressed: document.querySelector('[data-deck-choice="stonehauler"]')
        .getAttribute("aria-pressed"),
      defaultSetupStillActive: JSON.parse(
        globalThis.__deckChoiceController.session.serialize()).setup.deck,
    }));
    assert.equal(selectedBeforeStart.altPressed, "true");
    const expectedDefaultDeck = JSON.parse(
      new GameSession(createShippedGameSessionSetup(0)).serialize(),
    ).setup.deck;
    assert.deepEqual(selectedBeforeStart.defaultSetupStillActive, expectedDefaultDeck,
      "choosing the option changes the pending selection; Start Match installs it");
    await witnessPage.screenshot({ path: `${ARTIFACTS}stonehauler-selected.png` });
    await click(witnessPage, '[data-ui="deck-start"]');
    await witnessPage.evaluate(() => globalThis.__deckChoiceController.enterManualStepMode());

    const witness = createSessionTroopWitness("stonehauler");
    const opening = await witnessPage.evaluate(() => {
      const controller = globalThis.__deckChoiceController;
      const session = controller.session;
      const setup = JSON.parse(session.serialize()).setup;
      const roster = JSON.parse(setup.battleSetup).roster;
      const rosterById = new Map(roster.map((card) => [card.id, card]));
      const hand = session.state.decks.south.hand.map((id) => ({
        cost: rosterById.get(id).cost,
        id,
        name: rosterById.get(id).displayName,
      }));
      const hudHand = [...document.querySelectorAll('[data-ui="hud-hand"] .hud-card')]
        .map((node) => ({
          cost: Number(node.querySelector(".hud-card__cost").textContent),
          id: node.dataset.cardId,
          name: node.querySelector(".hud-card__name").textContent,
        }));
      const inputSlots = [...document.querySelectorAll('[data-ui="card-slot"]')]
        .map((node) => node.dataset.cardId);
      return {
        hand,
        hudHand,
        inputSlots,
        sessionBytes: session.serialize(),
        setup,
      };
    });
    const expectedWitnessSession = new GameSession(
      createShippedGameSessionSetup(1, "stonehauler-witness"),
    );
    const setup = JSON.parse(expectedWitnessSession.serialize()).setup;
    const witnessRoster = JSON.parse(setup.battleSetup).roster;
    const stonehauler = witnessRoster.find(({ id }) => id === "stonehauler");
    assert.deepEqual(witness.roster.map(({ id }) => id), setup.deck);
    assert.deepEqual(setup.deck, [
      "stonehauler", "coilblade", "mossguard", "copperskiff", "skymaul",
      "brassbolt", "reedsting", "briar-band",
    ]);
    assert.ok(!setup.deck.includes("cinderlings"), "Stonehauler replaces Cinderlings");
    assert.equal(stonehauler.cost, 5);
    assert.equal(stonehauler.displayName, "Stonehauler");
    assert.ok(stonehauler.entities.every(({ bodyRadiusPolicy, deliveryPolicy, layerPolicy }) =>
      bodyRadiusPolicy.kind === "question" && deliveryPolicy.kind === "question" &&
      layerPolicy.kind === "question"), "unknown mechanics remain explicit QUESTION policy");
    assert.deepEqual(JSON.parse(setup.battleSetup).roster, witness.roster);
    assert.deepEqual(JSON.parse(setup.battleSetup).questions, witness.questions);
    assert.deepEqual(JSON.parse(setup.battleSetup).initialWindupTicks,
      witness.initialWindupTicks);
    assert.equal(setup.seed, 1);
    assert.equal(opening.sessionBytes, expectedWitnessSession.serialize());
    assert.deepEqual(opening.hudHand, opening.hand,
      "HUD card names and costs come from the selected session roster");
    assert.deepEqual(opening.inputSlots, opening.hand.map(({ id }) => id),
      "physical input slots mirror the selected GameSession hand");
    assert.ok(opening.hand.some(({ id, cost, name }) =>
      id === "stonehauler" && cost === 5 && name === "Stonehauler"));
    await witnessPage.screenshot({ path: `${ARTIFACTS}stonehauler-opening.png` });

    await click(witnessPage, '[data-ui="card-slot"][data-card-id="stonehauler"]');
    await click(witnessPage, '[data-ui="arena"]', { x: 270, y: 760 });
    await witnessPage.evaluate(() => globalThis.__deckChoiceController.stepMany(1));
    const deployed = await witnessPage.evaluate(() => {
      const controller = globalThis.__deckChoiceController;
      const session = controller.session;
      const event = session.replay.find(({ side, type }) =>
        side === "south" && type === "session-deployed");
      const marker = document.querySelector(
        '.combat-marker[data-kind="stonehauler"] .combat-art',
      );
      return {
        artId: marker?.dataset.artId ?? null,
        artPathCount: marker?.querySelectorAll("path").length ?? 0,
        event,
        hand: session.state.decks.south.hand,
        inputSlots: [...document.querySelectorAll('[data-ui="card-slot"]')]
          .map((node) => node.dataset.cardId),
        southElixir: session.state.elixir.sides.south.amount,
        units: session.state.battle.units.filter(({ cardId }) => cardId === "stonehauler"),
      };
    });
    assert.ok(deployed.event, "the selected physical card reaches the shared GameSession");
    assert.equal(deployed.event.spend.cost, stonehauler.cost);
    assert.equal(deployed.southElixir, 5);
    assert.equal(deployed.units.length, 1);
    assert.equal(deployed.units[0].side, "south");
    assert.equal(deployed.artId, "stonehauler");
    assert.equal(deployed.artPathCount, 11, "original Stonehauler art renders after selection");
    assert.deepEqual(deployed.inputSlots, deployed.hand,
      "input slots follow the new post-deployment hand");
    await witnessPage.screenshot({ path: `${ARTIFACTS}stonehauler-deployed.png` });

    const continuation = await witnessPage.evaluate(() => {
      const controller = globalThis.__deckChoiceController;
      const checkpoint = controller.serialize();
      controller.stepMany(180);
      const forward = controller.serialize();
      const sessionForward = controller.session.serialize();
      controller.restore(checkpoint);
      const restored = controller.serialize();
      controller.stepMany(180);
      return {
        checkpointBytes: checkpoint.length,
        exactAtRestore: restored === checkpoint,
        forward,
        replayed: controller.serialize(),
        sessionForward,
        sessionReplayed: controller.session.serialize(),
      };
    });
    assert.equal(continuation.exactAtRestore, true,
      "browser restore reproduces exact snapshot bytes");
    assert.equal(continuation.replayed, continuation.forward,
      "restored browser continuation is byte-identical");
    assert.equal(continuation.sessionReplayed, continuation.sessionForward,
      "restored session continuation is byte-identical");
    await witnessPage.screenshot({ path: `${ARTIFACTS}stonehauler-restored.png` });

    const terminal = await witnessPage.evaluate(() => {
      const controller = globalThis.__deckChoiceController;
      let chunks = 0;
      while (!controller.state.terminal && chunks < 12) {
        controller.fastForwardSegment(1_200);
        chunks += 1;
      }
      return { chunks, result: controller.session.state.clock.result,
        state: controller.state, session: controller.session.serialize() };
    });
    assert.equal(terminal.state.terminal, true,
      "the selected deck reaches a real terminal match before restart");
    await witnessPage.screenshot({ path: `${ARTIFACTS}stonehauler-terminal.png` });
    await click(witnessPage, '[data-ui="restart"]');
    const restarted = await witnessPage.evaluate(() => {
      const controller = globalThis.__deckChoiceController;
      return {
        restartHidden: document.querySelector('[data-ui="restart"]').hidden,
        restartCount: controller.state.restartCount,
        sessionBytes: controller.session.serialize(),
        sessionTick: controller.state.sessionTick,
        setup: JSON.parse(controller.session.serialize()).setup,
      };
    });
    assert.equal(restarted.restartCount, 1);
    assert.equal(restarted.restartHidden, true);
    assert.equal(restarted.sessionTick, 0);
    assert.equal(restarted.sessionBytes, expectedWitnessSession.serialize(),
      "same-deck restart restores the exact selected setup and opening state");
    assert.deepEqual(restarted.setup.deck, setup.deck);
    await witnessPage.screenshot({ path: `${ARTIFACTS}stonehauler-restart.png` });

    evidence.preMatch = {
      modal: prep.modal,
      resetToSeedZero: prep.sessionBytes ===
        new GameSession(createShippedGameSessionSetup(0)).serialize(),
      running: prep.running,
      selected: prep.selected,
      sessionTick: prep.sessionTick,
    };
    evidence.stonehauler = {
      artId: deployed.artId,
      artPathCount: deployed.artPathCount,
      browserCheckpointBytes: continuation.checkpointBytes,
      browserReplayExact: continuation.replayed === continuation.forward,
      deployed: {
        cardId: deployed.event.deployment.cardId,
        cost: deployed.event.spend.cost,
        elixirAfter: deployed.southElixir,
        point: deployed.event.deployment.point,
        side: deployed.event.side,
      },
      hand: opening.hand,
      inputSlots: opening.inputSlots,
      questionPoliciesRemainQuestions: stonehauler.entities.every((entity) =>
        entity.bodyRadiusPolicy.kind === "question" &&
        entity.deliveryPolicy.kind === "question" &&
        entity.layerPolicy.kind === "question"),
      restartExact: restarted.sessionBytes === expectedWitnessSession.serialize(),
      restartCount: restarted.restartCount,
      sessionDeck: setup.deck,
      terminalChunks: terminal.chunks,
      terminalResult: terminal.result,
    };
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
  } finally {
    writeFileSync(`${ARTIFACTS}deck-choice-evidence.json`,
      `${JSON.stringify(evidence, null, 2)}\n`);
    server.kill("SIGTERM");
    await Promise.race([once(server, "exit"), new Promise((resolve) =>
      setTimeout(resolve, 2_000))]);
    await browser?.close();
  }
});
