import assert from "node:assert/strict";
import { once } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import test from "node:test";

import { GameSession } from "../src/sim/game-session.js";
import { MATCH_REGULATION_TICKS, MATCH_TICKS_PER_SECOND } from "../src/sim/match.js";
import { createShippedGameSessionSetup } from "../src/ui/game-browser-entry.js";

// Manual-step target safely past the opening clock band where every tick
// below MATCH_TICKS_PER_SECOND renders "3:00".
const CLOCK_PROBE_TICK = 90;

function expectedClockText(tick) {
  const seconds = Math.ceil(
    (MATCH_REGULATION_TICKS - tick) / MATCH_TICKS_PER_SECOND);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS = process.env.GAME_BROWSER_JOURNEY_ARTIFACTS
  ? `${process.env.GAME_BROWSER_JOURNEY_ARTIFACTS.replace(/\/+$/, "")}/`
  : new URL("../artifacts/game-001g-round-1/", import.meta.url).pathname;

async function line(stream) {
  let text = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) {
    text += chunk;
    const end = text.indexOf("\n");
    if (end >= 0) return text.slice(0, end);
  }
  throw new Error("journey server exited before readiness");
}

async function clickPoint(page, selector, offset = null) {
  const box = await page.locator(selector).first().boundingBox();
  assert.ok(box, `${selector} must have a browser box`);
  const x = box.x + (offset?.x ?? box.width / 2);
  const y = box.y + (offset?.y ?? box.height / 2);
  await page.mouse.click(x, y);
}

async function inspect(page) {
  return page.evaluate(async () => {
    const controller = (await import("/src/ui/arena-shell-entry.js")).arenaHudController;
    const session = controller.session.state;
    return {
      audio: controller.audio,
      bodyText: document.body.innerText.trim(),
      crowns: session.clock.crowns,
      elixir: session.elixir.sides,
      effects: document.querySelectorAll(".combat-effect-area,.combat-effect-impact,.combat-effect-path,.combat-effect-projectile").length,
      overlay: (() => {
        const node = document.querySelector(".match-feedback__overlay");
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { display: getComputedStyle(node).display,
          height: Math.round(box.height), width: Math.round(box.width) };
      })(),
      restartHidden: document.querySelector('[data-ui="restart"]').hidden,
      state: controller.state,
      timer: (() => {
        const node = document.querySelector('[data-ui="hud-timer"]');
        const box = node?.getBoundingClientRect();
        return node && box ? { display: getComputedStyle(node).display,
          height: Math.round(box.height), text: node.textContent,
          width: Math.round(box.width) } : null;
      })(),
      towers: session.battle.towers.map(({ hitpoints, id }) => ({ hitpoints, id })),
      units: [...document.querySelectorAll(".combat-marker--entity-ground,.combat-marker--entity-air")].map((node) => ({
        id: node.dataset.combatId,
        side: node.dataset.side,
        visible: (() => {
          const box = node.getBoundingClientRect();
          return getComputedStyle(node).position === "absolute" &&
            box.width > 0 && box.height > 0;
        })(),
        x: node.style.getPropertyValue("--combat-x"),
        y: node.style.getPropertyValue("--combat-y"),
      })),
    };
  });
}

async function finish(page) {
  const segments = [];
  for (let index = 0; index < 4; index += 1) {
    const segment = await page.evaluate(() => {
      const controller = globalThis.__gameBrowserJourneyController;
      const beforeTick = controller.state.sessionTick;
      const started = performance.now();
      const events = controller.fastForwardSegment(600);
      const state = controller.session.state;
      return { browser: controller.state,
        browserSnapshotBytes: controller.serialize().length,
        crowns: state.clock.crowns,
        elapsedMilliseconds: Math.round(performance.now() - started),
        entityCount: state.battle.units.length,
        eventCount: events.length,
        fromTick: beforeTick,
        replayCount: controller.session.replay.length,
        result: state.clock.result,
        sessionSnapshotBytes: controller.session.serialize().length,
        towers: state.battle.towers,
        toTick: state.tick };
    });
    segments.push(segment);
    await page.waitForTimeout(50);
    if (segment.browser.terminal) return { ...segment, segments };
  }
  throw new Error("bounded public terminal profile did not reach terminal");
}

async function prefix(page) {
  await clickPoint(page, '[data-ui="card-slot"]');
  await clickPoint(page, '[data-ui="arena"]', { x: 270, y: 760 });
  return page.evaluate(async () => {
    const controller = (await import("/src/ui/arena-shell-entry.js")).arenaHudController;
    controller.stepMany(600);
    return { bytes: controller.session.serialize(), view: {
      crowns: controller.session.state.clock.crowns,
      elixir: controller.session.state.elixir.sides,
      tick: controller.session.state.tick,
      units: [...document.querySelectorAll(".combat-marker--entity-ground,.combat-marker--entity-air")].map((node) => ({
        id: node.dataset.combatId, side: node.dataset.side,
        x: node.style.getPropertyValue("--combat-x"),
        y: node.style.getPropertyValue("--combat-y"),
      })),
    } };
  });
}

test("game browser journey: real Chrome plays, fights, terminates, restarts, and repeats", {
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
  const unhandled = [];
  try {
    const ready = JSON.parse(await line(server.stdout));
    const { chromium } = await import(PLAYWRIGHT);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const context = await browser.newContext({ deviceScaleFactor: 1,
      viewport: { height: 1_280, width: 720 } });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => unhandled.push(String(error)));
    const response = await page.goto(
      `http://${ready.host}:${ready.port}/public/ui-arena-shell.html?session-profile=live-seed-2-terminal`,
      { waitUntil: "domcontentloaded" },
    );
    assert.equal(response.status(), 200);
    await page.waitForSelector('[data-ui="arena"]');
    await page.waitForTimeout(250);
    const interactive = await page.evaluate(async () => {
      const isExposed = (node) => {
        for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          if (ancestor.hidden || ancestor.inert ||
              ancestor.getAttribute("aria-hidden") === "true" ||
              style.display === "none" || style.visibility === "hidden" ||
              style.visibility === "collapse") return false;
        }
        return true;
      };
      const mountedControls = [...document.querySelectorAll("button,[role=button],[tabindex]")];
      const choiceDialog = document.querySelector('[data-ui="deck-choice"]');
      const choiceButtons = [...choiceDialog.querySelectorAll("button")];
      const focusResults = choiceButtons.map((node) => {
        node.focus({ preventScroll: true });
        return document.activeElement === node;
      });
      return {
        blank: document.body.innerText.trim().length === 0,
        controller: Boolean((await import("/src/ui/arena-shell-entry.js")).arenaHudController),
        controls: mountedControls.filter(isExposed).map((node) => ({
          text: node.textContent.trim(), ui: node.dataset.ui ?? null,
        })),
        deckChoiceUnavailable: {
          dialogDisplay: getComputedStyle(choiceDialog).display,
          dialogHidden: choiceDialog.hidden,
          openerExposed: isExposed(document.querySelector('[data-ui="deck-choice-open"]')),
          optionFocusResults: focusResults,
          optionIds: choiceButtons.map((node) => node.dataset.deckChoice ?? node.dataset.ui),
        },
        errorOverlay: Boolean(document.querySelector(
          "[data-nextjs-dialog],.vite-error-overlay,#webpack-dev-server-client-overlay",
        )),
        mountedControlCount: mountedControls.length,
        pendingResources: performance.getEntriesByType("resource")
          .filter(({ duration }) => duration === 0).map(({ name }) => name),
      };
    });
    await page.evaluate(async () => {
      globalThis.__gameBrowserJourneyController =
        (await import("/src/ui/arena-shell-entry.js")).arenaHudController;
    });
    writeFileSync(`${ARTIFACTS}interactive-snapshot.json`,
      `${JSON.stringify(interactive, null, 2)}\n`);
    assert.deepEqual({ blank: interactive.blank, controller: interactive.controller,
      errorOverlay: interactive.errorOverlay, pendingResources: interactive.pendingResources },
    { blank: false, controller: true, errorOverlay: false, pendingResources: [] });
    assert.deepEqual(interactive.controls.map(({ ui }) => ui), ["audio-toggle"],
      "only controls exposed to users in this profile enter the visible control inventory");
    assert.ok(interactive.mountedControlCount > interactive.controls.length,
      "the raw DOM contains controls that are intentionally inactive in this profile");
    assert.deepEqual(interactive.deckChoiceUnavailable, {
      dialogDisplay: "none",
      dialogHidden: true,
      openerExposed: false,
      optionFocusResults: [false, false, false],
      optionIds: ["standard", "stonehauler", "deck-start"],
    }, "closed chooser descendants are hidden from layout and cannot take keyboard focus");
    await page.evaluate(() => {
      globalThis.__gameBrowserJourneyObservedCombat = false;
      const observe = () => {
        const controller = globalThis.__gameBrowserJourneyController;
        const visible = controller.session.replay.some(({ side, type }) =>
          side === "north" && type === "session-deployed") &&
          document.querySelectorAll(".combat-marker--entity-ground,.combat-marker--entity-air").length > 0;
        if (visible) {
          controller.enterManualStepMode();
          globalThis.__gameBrowserJourneyObservedCombat = true;
        } else requestAnimationFrame(observe);
      };
      requestAnimationFrame(observe);
    });
    await clickPoint(page, '[data-ui="audio-toggle"]');
    await page.waitForFunction(() => globalThis.__gameBrowserJourneyObservedCombat === true,
      null, { timeout: 30_000, polling: 50 });
    // The observer freezes the session at an arbitrary early tick, so never
    // assert on how many auto ticks elapsed pre-freeze.  Drive controlled
    // manual steps to a known tick and check the exact projected clock text.
    const clockProbe = await page.evaluate((targetTick) => {
      const controller = globalThis.__gameBrowserJourneyController;
      const startTick = controller.state.sessionTick;
      controller.fastForwardSegment(Math.max(0, targetTick - startTick));
      return { advancedTo: controller.state.sessionTick, startTick };
    }, CLOCK_PROBE_TICK);
    assert.equal(clockProbe.advancedTo,
      Math.max(clockProbe.startTick, CLOCK_PROBE_TICK));
    await page.waitForTimeout(50);
    const initial = await inspect(page);
    assert.ok(initial.timer?.width > 0 && initial.timer?.height > 0);
    assert.equal(initial.timer.text, expectedClockText(clockProbe.advancedTo));
    assert.notEqual(initial.timer.text, "3:00");
    await page.screenshot({ path: `${ARTIFACTS}initial.png` });
    const ticksToCommand = await page.evaluate(() =>
      105 - globalThis.__gameBrowserJourneyController.state.sessionTick);
    assert.ok(ticksToCommand >= 0 && ticksToCommand <= 105);
    await page.evaluate((count) =>
      globalThis.__gameBrowserJourneyController.fastForwardSegment(count), ticksToCommand);
    await page.waitForTimeout(50);
    await clickPoint(page, '[data-ui="card-slot"][data-card-id="coilblade"]');
    await clickPoint(page, '[data-ui="arena"]', { x: 439, y: 529 });
    await page.evaluate(() =>
      globalThis.__gameBrowserJourneyController.fastForwardSegment(1));
    await page.waitForTimeout(50);
    const deployed = await inspect(page);
    assert.equal(deployed.state.running, false,
      "manual acceleration begins only after visible live combat");
    await page.screenshot({ path: `${ARTIFACTS}deploy.png` });
    assert.ok(deployed.units.length > 0);
    assert.equal(deployed.units.every(({ visible }) => visible), true);
    assert.equal(deployed.audio.audio.unlockCount, 1);
    assert.equal(deployed.audio.muted, true);
    const responseReplay = await page.evaluate(async () => {
      const replay = (await import("/src/ui/arena-shell-entry.js"))
        .arenaHudController.session.replay;
      return {
        north: replay.some(({ side, type }) => side === "north" && type === "session-deployed"),
        south: replay.some(({ side, type }) => side === "south" && type === "session-deployed"),
      };
    });
    assert.deepEqual(responseReplay, { north: true, south: true });

    await page.evaluate(() =>
      globalThis.__gameBrowserJourneyController.fastForwardSegment(1_000));
    await page.waitForTimeout(50);
    const combat = await inspect(page);
    await page.screenshot({ path: `${ARTIFACTS}combat.png` });
    const moved = deployed.units.some((before) => {
      const after = combat.units.find(({ id }) => id === before.id);
      return after === undefined || after.x !== before.x || after.y !== before.y;
    });
    let combatEventCount = await page.evaluate(async () =>
      (await import("/src/ui/arena-shell-entry.js")).arenaHudController.session.replay
        .filter(({ type }) => ["attack", "damage", "projectile-impact"].includes(type)).length);
    assert.equal(moved, true);
    assert.notEqual(combat.timer.text, initial.timer.text);
    assert.notDeepEqual(combat.elixir, initial.elixir);

    const terminal = await finish(page);
    combatEventCount = await page.evaluate(() =>
      globalThis.__gameBrowserJourneyController.session.replay
        .filter(({ type }) => ["attack", "damage", "projectile-impact"].includes(type)).length);
    writeFileSync(`${ARTIFACTS}fast-forward-telemetry.json`,
      `${JSON.stringify(terminal.segments, null, 2)}\n`);
    assert.ok(combatEventCount > 0, "real units must fight before terminal");
    assert.equal(terminal.browser.terminal, true);
    const terminalView = await inspect(page);
    assert.ok(terminalView.overlay?.width > 0 && terminalView.overlay?.height > 0);
    assert.equal(terminalView.restartHidden, false);
    assert.notDeepEqual(terminal.crowns, initial.crowns);
    assert.ok(terminal.towers.some((tower, index) =>
      tower.hitpoints !== initial.towers[index].hitpoints));
    await page.screenshot({ path: `${ARTIFACTS}terminal.png` });

    await clickPoint(page, '[data-ui="restart"]');
    const seedZeroBytes = new GameSession(createShippedGameSessionSetup(0)).serialize();
    const restartedBytes = await page.evaluate(async () =>
      (await import("/src/ui/arena-shell-entry.js")).arenaHudController.session.serialize());
    assert.equal(restartedBytes, seedZeroBytes);
    const restarted = await inspect(page);
    assert.equal(restarted.state.sessionTick, 0);
    assert.equal(restarted.overlay, null);
    assert.equal(restarted.restartHidden, true);
    await page.screenshot({ path: `${ARTIFACTS}restart.png` });

    const repeated = await prefix(page);
    const expected = new GameSession(createShippedGameSessionSetup(0));
    expected.submitPlayerCommand(JSON.stringify({ cardId: expected.state.decks.south.hand[0],
      commandId: 1, point: { x: 8_866, y: 6_800 }, slot: 0, tick: 0, type: "deploy" }));
    expected.stepMany(600);
    assert.equal(repeated.bytes, expected.serialize());
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(unhandled, []);
    assert.equal(await page.evaluate(() => document.body.innerText.trim().length > 0), true);
    assert.equal(await page.evaluate(() => Boolean(document.querySelector(
      "[data-nextjs-dialog],.vite-error-overlay,#webpack-dev-server-client-overlay",
    ))), false);
    writeFileSync(`${ARTIFACTS}journey-result.json`, `${JSON.stringify({
      combatEventCount, consoleErrors, initial, interactive, repeated: repeated.view,
      responseReplay, terminal,
      unhandled,
    }, null, 2)}\n`);
  } finally {
    try { await browser?.close(); } catch {}
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await Promise.race([once(server, "exit"), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    }
  }
});
