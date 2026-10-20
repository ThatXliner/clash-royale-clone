import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import test from "node:test";

import { GameSession } from "../src/sim/game-session.js";
import { createShippedGameSessionSetup } from "../src/ui/game-browser-entry.js";

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS = process.env.GAME_BROWSER_DECK_KEYBOARD_ARTIFACTS
  ? `${process.env.GAME_BROWSER_DECK_KEYBOARD_ARTIFACTS.replace(/\/+$/, "")}/`
  : new URL("../artifacts/game-001huif-round-1/", import.meta.url).pathname;

async function line(stream) {
  let value = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) {
    value += chunk;
    const end = value.indexOf("\n");
    if (end >= 0) return value.slice(0, end);
  }
  throw new Error("deck-keyboard server exited before readiness");
}

async function focusedControl(page) {
  return page.evaluate(() => {
    const node = document.activeElement;
    return node?.dataset?.deckChoice ?? node?.dataset?.ui ?? null;
  });
}

test("game browser deck keyboard: trusted focus, selection, cancellation, and start", {
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
      window.__deckKeyboardTrustedClicks = [];
      document.addEventListener("click", (event) => {
        const node = event.target instanceof Element
          ? event.target.closest("[data-ui='deck-choice-open'],[data-deck-choice],[data-ui='deck-start']")
          : null;
        if (node !== null) {
          window.__deckKeyboardTrustedClicks.push({
            target: node.dataset.deckChoice ?? node.dataset.ui,
            trusted: event.isTrusted,
          });
        }
      }, true);
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
    const initial = await page.evaluate(async () => {
      const controller = (await import("/src/ui/arena-shell-entry.js")).arenaHudController;
      controller.enterManualStepMode();
      globalThis.__deckKeyboardController = controller;
      const hiddenControls = [...document.querySelectorAll('[data-ui="deck-choice"] button')];
      const focusResults = hiddenControls.map((node) => {
        node.focus({ preventScroll: true });
        return document.activeElement === node;
      });
      const opener = document.querySelector('[data-ui="deck-choice-open"]');
      const box = opener.getBoundingClientRect();
      return {
        focusResults,
        openerBox: { height: box.height, width: box.width },
        sessionBytes: controller.session.serialize(),
        tick: controller.state.sessionTick,
      };
    });
    const seedZero = new GameSession(createShippedGameSessionSetup(0)).serialize();
    assert.equal(initial.sessionBytes, seedZero,
      "the closed chooser keeps the standard seed-zero opening exact");
    assert.deepEqual(initial.focusResults, [false, false, false, false],
      "closed chooser buttons cannot receive focus");
    assert.ok(initial.openerBox.width >= 72 && initial.openerBox.height >= 40,
      "the keyboard opener is visible at the shipped viewport");
    assert.equal(initial.tick, 0);

    await page.locator('[data-ui="deck-choice-open"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForSelector('[data-ui="deck-choice"]:not([hidden])');
    const openState = await page.evaluate(() => ({
      activeChoice: document.activeElement?.dataset?.deckChoice ?? null,
      audioInert: document.querySelector('[data-ui="audio-toggle"]').inert,
      dialogExpanded: document.querySelector('[data-ui="deck-choice-open"]')
        .getAttribute("aria-expanded"),
      dialogHidden: document.querySelector('[data-ui="deck-choice"]').hidden,
      running: globalThis.__deckKeyboardController.state.running,
      sessionBytes: globalThis.__deckKeyboardController.session.serialize(),
      tick: globalThis.__deckKeyboardController.state.sessionTick,
    }));
    assert.equal(openState.activeChoice, "standard",
      "keyboard activation transfers focus into the open dialog");
    assert.equal(openState.audioInert, true, "the match controls are inert while the dialog is open");
    assert.equal(openState.dialogExpanded, "true");
    assert.equal(openState.dialogHidden, false);
    assert.equal(openState.sessionBytes, seedZero,
      "opening the chooser leaves the seed-zero session exact");
    assert.equal(openState.tick, 0);
    assert.equal(openState.running, false);
    await page.screenshot({ path: `${ARTIFACTS}keyboard-dialog-open.png` });

    const syntheticAttempts = await page.evaluate(() => {
      document.querySelector('[data-deck-choice="stonehauler"]').click();
      document.querySelector('[data-ui="deck-start"]').click();
      return {
        clicks: window.__deckKeyboardTrustedClicks.slice(),
        dialogHidden: document.querySelector('[data-ui="deck-choice"]').hidden,
        running: globalThis.__deckKeyboardController.state.running,
        selected: document.querySelector('[data-deck-choice="standard"]')
          .getAttribute("aria-pressed"),
        sessionBytes: globalThis.__deckKeyboardController.session.serialize(),
      };
    });
    assert.ok(syntheticAttempts.clicks.some(({ target, trusted }) =>
      target === "stonehauler" && !trusted));
    assert.ok(syntheticAttempts.clicks.some(({ target, trusted }) =>
      target === "deck-start" && !trusted));
    assert.equal(syntheticAttempts.selected, "true",
      "an untrusted scripted click cannot select a deck");
    assert.equal(syntheticAttempts.dialogHidden, false,
      "an untrusted scripted click cannot start the match");
    assert.equal(syntheticAttempts.running, false);
    assert.equal(syntheticAttempts.sessionBytes, seedZero);

    const focusSequence = [await focusedControl(page)];
    for (const key of ["Tab", "Tab", "Tab", "Tab", "Shift+Tab"]) {
      await page.keyboard.press(key);
      focusSequence.push(await focusedControl(page));
    }
    assert.deepEqual(focusSequence,
      ["standard", "stonehauler", "bulwark-needle", "deck-start", "standard", "deck-start"],
      "Tab and Shift+Tab cycle through the visible dialog controls");
    const inertFocusState = await page.evaluate(() => {
      const start = document.querySelector('[data-ui="deck-start"]');
      document.querySelector('[data-ui="audio-toggle"]').focus({ preventScroll: true });
      return document.activeElement === start;
    });
    assert.equal(inertFocusState, true,
      "programmatic focus cannot escape the modal into the match controls");

    // Keyboard input traverses the native button activation path. The page's
    // capture listener records the resulting browser-trusted click events.
    for (const key of ["Tab", "Tab"]) await page.keyboard.press(key);
    assert.equal(await focusedControl(page), "stonehauler");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() =>
      document.querySelector('[data-deck-choice="stonehauler"]')
        .getAttribute("aria-pressed") === "true");
    const pendingAlt = await page.evaluate(() => ({
      trustedClicks: window.__deckKeyboardTrustedClicks,
      sessionBytes: globalThis.__deckKeyboardController.session.serialize(),
      selected: document.querySelector('[data-deck-choice="stonehauler"]')
        .getAttribute("aria-pressed"),
    }));
    assert.equal(pendingAlt.selected, "true");
    assert.equal(pendingAlt.sessionBytes, seedZero,
      "keyboard selection only changes the pending deck");
    assert.ok(pendingAlt.trustedClicks.some(({ target, trusted }) =>
      target === "stonehauler" && trusted),
    "the selected deck came from a trusted native keyboard click");

    await page.keyboard.press("Escape");
    await page.waitForFunction(() => document.querySelector('[data-ui="deck-choice"]').hidden);
    const cancelled = await page.evaluate(() => {
      const opener = document.querySelector('[data-ui="deck-choice-open"]');
      const controls = [...document.querySelectorAll('[data-ui="deck-choice"] button')];
      const focusResults = controls.map((node) => {
        node.focus({ preventScroll: true });
        return document.activeElement === node;
      });
      return {
        activeOpener: document.activeElement === opener,
        ariaExpanded: opener.getAttribute("aria-expanded"),
        audioInert: document.querySelector('[data-ui="audio-toggle"]').inert,
        focusResults,
        running: globalThis.__deckKeyboardController.state.running,
        sessionBytes: globalThis.__deckKeyboardController.session.serialize(),
        tick: globalThis.__deckKeyboardController.state.sessionTick,
      };
    });
    assert.equal(cancelled.activeOpener, true, "Escape returns focus to Choose deck");
    assert.equal(cancelled.ariaExpanded, "false");
    assert.equal(cancelled.audioInert, false);
    assert.deepEqual(cancelled.focusResults, [false, false, false, false]);
    assert.equal(cancelled.sessionBytes, seedZero,
      "Escape closes without starting or changing the seed-zero session");
    assert.equal(cancelled.tick, 0);
    assert.equal(cancelled.running, false);

    await page.keyboard.press("Enter");
    await page.waitForFunction(() =>
      document.querySelector('[data-deck-choice="standard"]')
        .getAttribute("aria-pressed") === "true");
    for (const key of ["Tab", "Tab", "Tab"]) await page.keyboard.press(key);
    assert.equal(await focusedControl(page), "deck-start");
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => document.querySelector('[data-ui="deck-choice"]').hidden);
    const started = await page.evaluate(() => {
      const controller = globalThis.__deckKeyboardController;
      const audio = document.querySelector('[data-ui="audio-toggle"]');
      const hiddenControls = [...document.querySelectorAll('[data-ui="deck-choice"] button')];
      const focusResults = hiddenControls.map((node) => {
        node.focus({ preventScroll: true });
        return document.activeElement === node;
      });
      return {
        activeControl: document.activeElement?.dataset?.ui ?? null,
        audioVisible: audio.getBoundingClientRect().width > 0 &&
          audio.getBoundingClientRect().height > 0,
        choiceOpenerHidden: document.querySelector('[data-ui="deck-choice-open"]').hidden,
        focusResults,
        running: controller.state.running,
        sessionBytes: controller.session.serialize(),
        trustedClicks: window.__deckKeyboardTrustedClicks,
      };
    });
    assert.equal(started.activeControl, "audio-toggle",
      "starting moves focus to a visible match control");
    assert.equal(started.audioVisible, true);
    assert.equal(started.choiceOpenerHidden, true);
    assert.deepEqual(started.focusResults, [false, false, false, false]);
    assert.equal(started.sessionBytes, seedZero,
      "keyboard Start installs the exact standard seed-zero session");
    assert.equal(started.running, true);
    assert.ok(started.trustedClicks.some(({ target, trusted }) =>
      target === "deck-start" && trusted),
    "keyboard Start uses the browser-trusted native button click");
    evidence.focusSequence = focusSequence;
    evidence.cancelledWithoutSessionChange = cancelled.sessionBytes === seedZero &&
      cancelled.tick === 0 && !cancelled.running;
    evidence.escape = {
      activeOpener: cancelled.activeOpener,
      ariaExpanded: cancelled.ariaExpanded,
      focusResults: cancelled.focusResults,
      sessionExactSeedZero: cancelled.sessionBytes === seedZero,
      tick: cancelled.tick,
      running: cancelled.running,
    };
    evidence.keyboardActivationClicks = pendingAlt.trustedClicks;
    evidence.ignoredSyntheticClicks = syntheticAttempts.clicks.filter(({ trusted }) => !trusted);
    evidence.open = {
      activeChoice: openState.activeChoice,
      audioInert: openState.audioInert,
      dialogExpanded: openState.dialogExpanded,
      dialogHidden: openState.dialogHidden,
      running: openState.running,
      sessionExactSeedZero: openState.sessionBytes === seedZero,
      tick: openState.tick,
    };
    evidence.started = {
      activeControl: started.activeControl,
      audioVisible: started.audioVisible,
      choiceOpenerHidden: started.choiceOpenerHidden,
      focusResults: started.focusResults,
      running: started.running,
      sessionExactSeedZero: started.sessionBytes === seedZero,
      trustedStartClick: started.trustedClicks.some(({ target, trusted }) =>
        target === "deck-start" && trusted),
    };
    writeFileSync(`${ARTIFACTS}keyboard-evidence.json`, `${JSON.stringify(evidence, null, 2)}\n`);
    assert.deepEqual(consoleErrors, [], "Chrome reports no console errors");
    assert.deepEqual(pageErrors, [], "Chrome reports no page errors");
    await page.close();
    await context.close();
  } finally {
    await browser?.close();
    server.kill("SIGTERM");
    await once(server, "exit");
  }
});
