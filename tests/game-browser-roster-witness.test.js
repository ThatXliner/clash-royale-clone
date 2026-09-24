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
const ARTIFACTS = new URL("../artifacts/game-001huik-round-1/", import.meta.url).pathname;

async function line(stream) {
  let value = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) {
    value += chunk;
    const end = value.indexOf("\n");
    if (end >= 0) return value.slice(0, end);
  }
  throw new Error("roster witness server exited before readiness");
}

async function clickPoint(page, selector, offset = null) {
  const box = await page.locator(selector).first().boundingBox();
  assert.ok(box, `${selector} must have a browser box`);
  await page.mouse.click(box.x + (offset?.x ?? box.width / 2),
    box.y + (offset?.y ?? box.height / 2));
}

test("game browser roster witness: real page deploys, restores, and restarts Stonehauler", {
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
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    const response = await page.goto(
      `http://${ready.host}:${ready.port}/public/ui-arena-shell.html?session-profile=stonehauler-witness`,
      { waitUntil: "domcontentloaded" },
    );
    assert.equal(response.status(), 200);
    await page.waitForSelector('[data-ui="arena"]');
    const opening = await page.evaluate(async () => {
      const controller = (await import("/src/ui/arena-shell-entry.js")).arenaHudController;
      controller.enterManualStepMode();
      globalThis.__stonehaulerWitnessController = controller;
      const witness = (await import("/src/content/session-troop-roster.js"))
        .createSessionTroopWitness("stonehauler");
      const snapshot = JSON.parse(controller.session.serialize());
      const setup = snapshot.setup;
      const battleSetup = JSON.parse(setup.battleSetup);
      const hand = [...document.querySelectorAll('[data-ui="hud-hand"] .hud-card')]
        .map((node) => ({
          cost: Number(node.querySelector(".hud-card__cost").textContent),
          id: node.dataset.cardId,
          name: node.querySelector(".hud-card__name").textContent,
        }));
      const inputSlots = [...document.querySelectorAll('[data-ui="card-slot"]')]
        .map((node) => node.dataset.cardId);
      const sessionHand = controller.session.state.decks.south.hand;
      return {
        battleSetup,
        browserBytes: controller.serialize(),
        hand,
        inputSlots,
        sessionHand,
        questions: battleSetup.questions,
        roster: battleSetup.roster,
        seed: setup.seed,
        sessionBytes: controller.session.serialize(),
        witness,
      };
    });
    const witness = createSessionTroopWitness("stonehauler");
    const defaultSetup = createShippedGameSessionSetup(0);
    assert.equal(defaultSetup, createShippedGameSessionSetup(0, "standard"),
      "default seed-zero setup bytes remain exact");
    assert.equal(opening.seed, 1);
    assert.deepEqual(opening.witness, witness);
    assert.deepEqual(opening.roster, witness.roster);
    assert.deepEqual(opening.questions, witness.questions);
    assert.deepEqual(opening.battleSetup.initialWindupTicks,
      witness.initialWindupTicks);
    assert.deepEqual(opening.battleSetup.roster.map(({ id }) => id), [
      "stonehauler", "coilblade", "mossguard", "copperskiff", "skymaul",
      "brassbolt", "reedsting", "briar-band",
    ]);
    assert.ok(!opening.battleSetup.roster.some(({ id }) => id === "cinderlings"));
    const stonehauler = opening.battleSetup.roster.find(({ id }) => id === "stonehauler");
    assert.equal(stonehauler.cost, 5);
    assert.equal(stonehauler.displayName, "Stonehauler");
    assert.ok(stonehauler.entities.every(({ bodyRadiusPolicy, deliveryPolicy, layerPolicy }) =>
      bodyRadiusPolicy.kind === "question" && deliveryPolicy.kind === "question" &&
      layerPolicy.kind === "question"),
    "estimated ordinary policies remain explicitly QUESTION");
    const rosterById = new Map(witness.roster.map((card) => [card.id, card]));
    assert.deepEqual(opening.hand, opening.sessionHand.map((id) => ({
      cost: rosterById.get(id).cost,
      id,
      name: rosterById.get(id).displayName,
    })), "HUD labels and costs come from the active session roster");
    const currentHand = JSON.parse(opening.browserBytes);
    assert.equal(currentHand.version, 2);
    assert.deepEqual(opening.inputSlots, opening.hand.map(({ id }) => id),
      "input card IDs and visible hand are backed by the witness deck");
    assert.ok(opening.hand.some(({ id, cost, name }) =>
      id === "stonehauler" && cost === 5 && name === "Stonehauler"));
    await page.screenshot({ path: `${ARTIFACTS}stonehauler-opening.png` });

    await clickPoint(page, '[data-ui="card-slot"][data-card-id="stonehauler"]');
    const selected = await page.evaluate(() =>
      document.querySelector('[data-ui="hud-hand"] [data-card-id="stonehauler"]')
        ?.dataset.selected);
    assert.equal(selected, "true", "the witness card can be selected by physical input");
    await clickPoint(page, '[data-ui="arena"]', { x: 270, y: 760 });
    const deployed = await page.evaluate(() => {
      const controller = globalThis.__stonehaulerWitnessController;
      controller.stepMany(1);
      const state = controller.session.state;
      const event = controller.session.replay.find(({ side, type }) =>
        side === "south" && type === "session-deployed");
      const marker = document.querySelector(
        '.combat-marker[data-kind="stonehauler"] .combat-art',
      );
      return {
        artId: marker?.dataset.artId ?? null,
        artPathCount: marker?.querySelectorAll("path").length ?? 0,
        event: event ?? null,
        units: state.battle.units.filter(({ cardId }) => cardId === "stonehauler"),
        tick: state.tick,
      };
    });
    assert.ok(deployed.event, "physical deployment reaches the shared GameSession");
    assert.equal(deployed.event.spend.cost, stonehauler.cost);
    assert.ok(deployed.event.deployment.point.y < 15_000,
      "physical placement is admitted on the south deployment side");
    assert.equal(deployed.units.length, 1);
    assert.equal(deployed.units[0].side, "south");
    assert.equal(deployed.artId, "stonehauler");
    assert.equal(deployed.artPathCount, 11,
      "Stonehauler renders its original multi-path combat silhouette");
    await page.screenshot({ path: `${ARTIFACTS}stonehauler-deployed.png` });

    const continuation = await page.evaluate(() => {
      const controller = globalThis.__stonehaulerWitnessController;
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
      "browser snapshot bytes restore exactly before continuing");
    assert.equal(continuation.replayed, continuation.forward,
      "restored continuation reaches byte-identical browser state");
    assert.equal(continuation.sessionReplayed, continuation.sessionForward,
      "restored continuation reaches byte-identical session state");
    await page.screenshot({ path: `${ARTIFACTS}stonehauler-restored.png` });

    const terminal = await page.evaluate(() => {
      const controller = globalThis.__stonehaulerWitnessController;
      let chunks = 0;
      while (!controller.state.terminal && chunks < 12) {
        controller.fastForwardSegment(1_200);
        chunks += 1;
      }
      return { chunks, state: controller.state, session: controller.session.serialize() };
    });
    assert.equal(terminal.state.terminal, true,
      "witness session reaches a real terminal state for restart verification");
    await page.screenshot({ path: `${ARTIFACTS}stonehauler-terminal.png` });
    await clickPoint(page, '[data-ui="restart"]');
    const restarted = await page.evaluate(() => {
      const controller = globalThis.__stonehaulerWitnessController;
      return {
        hidden: document.querySelector('[data-ui="restart"]').hidden,
        restartCount: controller.state.restartCount,
        sessionBytes: controller.session.serialize(),
        state: controller.state,
      };
    });
    const expectedRestart = new GameSession(
      createShippedGameSessionSetup(1, "stonehauler-witness"),
    );
    assert.equal(restarted.restartCount, 1);
    assert.equal(restarted.hidden, true);
    assert.equal(restarted.state.sessionTick, 0);
    assert.equal(restarted.sessionBytes, expectedRestart.serialize(),
      "restart preserves the exact nondefault witness deck and setup");
    assert.deepEqual(JSON.parse(restarted.sessionBytes).setup.deck,
      witness.roster.map(({ id }) => id));
    await page.screenshot({ path: `${ARTIFACTS}stonehauler-restart.png` });
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);
    writeFileSync(`${ARTIFACTS}browser-witness-evidence.json`, `${JSON.stringify({
      artId: deployed.artId,
      artPathCount: deployed.artPathCount,
      browserCheckpointBytes: continuation.checkpointBytes,
      browserReplayExact: continuation.replayed === continuation.forward,
      consoleErrors,
      deployed,
      hand: opening.hand,
      inputSlots: opening.inputSlots,
      sessionHand: opening.sessionHand,
      pageErrors,
      questionPoliciesRemainQuestions: stonehauler.entities.every((entity) =>
        entity.bodyRadiusPolicy.kind === "question" &&
        entity.deliveryPolicy.kind === "question" &&
        entity.layerPolicy.kind === "question"),
      restartedDeck: JSON.parse(restarted.sessionBytes).setup.deck,
      sessionReplayExact: continuation.sessionReplayed === continuation.sessionForward,
      terminal: { chunks: terminal.chunks, tick: terminal.state.sessionTick },
      witnessRoster: witness.roster.map(({ id }) => id),
    }, null, 2)}\n`);
  } finally {
    try { await browser?.close(); } catch {}
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await Promise.race([once(server, "exit"), new Promise((resolve) => setTimeout(resolve, 2_000))]);
    }
  }
});
